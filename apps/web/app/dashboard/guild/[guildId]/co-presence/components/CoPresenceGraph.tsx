'use client';

// sigma.js(@react-sigma/core, graphology) 의존성이 없으므로
// HTML5 Canvas를 직접 사용하여 네트워크 그래프를 구현한다.
// 의존성 설치 후 sigma.js 기반으로 교체 가능하도록 Props 인터페이스는 동일하게 유지한다.

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CoPresenceGraphData } from '@/app/lib/co-presence-api';
import { formatMinutesI18n } from '@/app/lib/format-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
];

const MIN_NODE_SIZE = 8;
const MAX_NODE_SIZE = 40;
const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 8;
const LABEL_FONT = '12px sans-serif';
const TOOLTIP_FONT = '11px sans-serif';
const DEBOUNCE_MS = 300;

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const ZOOM_SENSITIVITY = 0.001;

// 레이아웃 상수
const GRAPH_DEFAULT_WIDTH = 700;
const INITIAL_LAYOUT_RADIUS_RATIO = 0.38;

// 그리기 투명도 상수
const EDGE_DIMMED_ALPHA = 0.08;
const EDGE_NORMAL_ALPHA = 0.6;
const NODE_DIMMED_ALPHA = 0.15;

// 범례 노드 크기 표시용
const LEGEND_NODE_LARGE_OFFSET = 18;

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface NodePosition {
  x: number;
  y: number;
  radius: number;
  color: string;
  label: string;
  userId: string;
}

interface CoPresenceGraphProps {
  data: CoPresenceGraphData;
  minMinutes: number;
  isLoading: boolean;
  onMinMinutesChange: (value: number) => void;
}

interface DragState {
  type: 'none' | 'pan' | 'node';
  nodeId?: string;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  startNodeX: number;
  startNodeY: number;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function computeNodeSize(minutes: number, maxMinutes: number): number {
  if (maxMinutes === 0) return MIN_NODE_SIZE;
  return MIN_NODE_SIZE + (minutes / maxMinutes) * (MAX_NODE_SIZE - MIN_NODE_SIZE);
}

function computeEdgeWidth(minutes: number, maxMinutes: number): number {
  if (maxMinutes === 0) return MIN_EDGE_WIDTH;
  return MIN_EDGE_WIDTH + (minutes / maxMinutes) * (MAX_EDGE_WIDTH - MIN_EDGE_WIDTH);
}

/** 단순 커뮤니티 분류: degree 기반으로 인접 노드 그룹 색상 할당 */
function assignClusterColors(
  nodeIds: string[],
  edges: CoPresenceGraphData['edges'],
): Map<string, string> {
  const adjacency = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.userA)?.add(edge.userB);
    adjacency.get(edge.userB)?.add(edge.userA);
  }

  // 탐욕적 그래프 채색(greedy coloring)으로 클러스터 색상 할당
  const colorIndex = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const neighborColors = new Set<number>();
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const nc = colorIndex.get(neighbor);
      if (nc !== undefined) neighborColors.add(nc);
    }
    let idx = 0;
    while (neighborColors.has(idx)) idx++;
    colorIndex.set(nodeId, idx % CLUSTER_COLORS.length);
  }

  const result = new Map<string, string>();
  for (const [nodeId, idx] of colorIndex) {
    result.set(nodeId, CLUSTER_COLORS[idx] ?? CLUSTER_COLORS[0]);
  }
  return result;
}

interface InitialPositionsParams {
  nodes: CoPresenceGraphData['nodes'];
  width: number;
  height: number;
  colorMap: Map<string, string>;
}

/** 원형 배치로 초기 노드 위치를 결정 */
function computeInitialPositions({
  nodes,
  width,
  height,
  colorMap,
}: InitialPositionsParams): NodePosition[] {
  const maxMinutes = Math.max(...nodes.map((n) => n.totalMinutes), 1);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * INITIAL_LAYOUT_RADIUS_RATIO;

  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      userId: node.userId,
      label: node.userName,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      radius: computeNodeSize(node.totalMinutes, maxMinutes),
      color: colorMap.get(node.userId) ?? CLUSTER_COLORS[0],
    };
  });
}

interface ForceStepParams {
  positions: NodePosition[];
  edges: CoPresenceGraphData['edges'];
  width: number;
  height: number;
}

/** Force-directed layout 한 스텝 */
function applyForceStep({ positions, edges, width, height }: ForceStepParams): NodePosition[] {
  const REPULSION = 3_000;
  const ATTRACTION = 0.05;
  const DAMPING = 0.85;
  const MAX_FORCE = 20;

  const forces = positions.map(() => ({ fx: 0, fy: 0 }));

  // 반발력
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i].x - positions[j].x;
      const dy = positions[i].y - positions[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;
      forces[i].fx += fx;
      forces[i].fy += fy;
      forces[j].fx -= fx;
      forces[j].fy -= fy;
    }
  }

  // 인력 (엣지 기반)
  const posMap = new Map(positions.map((p) => [p.userId, p]));
  for (const edge of edges) {
    const a = posMap.get(edge.userA);
    const b = posMap.get(edge.userB);
    const idxA = positions.findIndex((p) => p.userId === edge.userA);
    const idxB = positions.findIndex((p) => p.userId === edge.userB);
    if (!a || !b || idxA === -1 || idxB === -1) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = ATTRACTION * dx;
    const fy = ATTRACTION * dy;
    forces[idxA].fx += fx;
    forces[idxA].fy += fy;
    forces[idxB].fx -= fx;
    forces[idxB].fy -= fy;
  }

  const margin = 60;
  return positions.map((pos, i) => {
    const fx = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, forces[i].fx * DAMPING));
    const fy = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, forces[i].fy * DAMPING));
    return {
      ...pos,
      x: Math.max(margin, Math.min(width - margin, pos.x + fx)),
      y: Math.max(margin, Math.min(height - margin, pos.y + fy)),
    };
  });
}

interface ScreenToWorldParams {
  screenX: number;
  screenY: number;
  scale: number;
  offset: { x: number; y: number };
}

/** 스크린 좌표 → 월드 좌표 변환 */
function screenToWorld({ screenX, screenY, scale, offset }: ScreenToWorldParams): {
  wx: number;
  wy: number;
} {
  return {
    wx: (screenX - offset.x) / scale,
    wy: (screenY - offset.y) / scale,
  };
}

interface HitTestParams {
  wx: number;
  wy: number;
  positions: NodePosition[];
}

/** 월드 좌표에서 노드 히트 테스트 */
function hitTestNode({ wx, wy, positions }: HitTestParams): NodePosition | null {
  // 역순 탐색 — 나중에 그려진 노드가 위에 있으므로
  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    const dx = pos.x - wx;
    const dy = pos.y - wy;
    if (Math.sqrt(dx * dx + dy * dy) <= pos.radius + 4) {
      return pos;
    }
  }
  return null;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function CoPresenceGraph({
  data,
  minMinutes,
  isLoading,
  onMinMinutesChange,
}: CoPresenceGraphProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<NodePosition[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 줌/팬 상태
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<DragState>({
    type: 'none',
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  // 줌/팬 리셋
  const handleResetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // data 변경 시 레이아웃 초기화 및 force 시뮬레이션 실행
  useEffect(() => {
    const canvas = canvasRef.current;
    const width = (canvas?.offsetWidth ?? 0) || GRAPH_DEFAULT_WIDTH;
    const height = 480;

    if (data.nodes.length === 0) {
      queueMicrotask(() => {
        setPositions([]);
        setSelectedNode(null);
        setHoveredNode(null);
      });
      return;
    }

    const colorMap = assignClusterColors(
      data.nodes.map((n) => n.userId),
      data.edges,
    );

    let pos = computeInitialPositions({ nodes: data.nodes, width, height, colorMap });

    const STEPS = 50;
    for (let i = 0; i < STEPS; i++) {
      pos = applyForceStep({ positions: pos, edges: data.edges, width, height });
    }

    const computed = pos;
    queueMicrotask(() => {
      setPositions(computed);
      setSelectedNode(null);
      setHoveredNode(null);
      // 새 데이터 로드 시 뷰 리셋
      setScale(1);
      setOffset({ x: 0, y: 0 });
    });
  }, [data]);

  // 노드별 연결 수 & 엣지 정보 계산 (툴팁용)
  const nodeStats = useCallback(() => {
    const stats = new Map<string, { connectionCount: number; totalMinutes: number }>();
    for (const node of data.nodes) {
      stats.set(node.userId, { connectionCount: 0, totalMinutes: node.totalMinutes });
    }
    for (const edge of data.edges) {
      const a = stats.get(edge.userA);
      const b = stats.get(edge.userB);
      if (a) a.connectionCount++;
      if (b) b.connectionCount++;
    }
    return stats;
  }, [data]);

  // canvas 렌더링
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (positions.length === 0) return;

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    const posMap = new Map(positions.map((p) => [p.userId, p]));
    const maxEdgeMinutes = Math.max(...data.edges.map((e) => e.totalMinutes), 1);

    // 선택된 노드의 연결된 노드 집합
    const connectedNodes = new Set<string>();
    if (selectedNode) {
      connectedNodes.add(selectedNode);
      for (const edge of data.edges) {
        if (edge.userA === selectedNode) connectedNodes.add(edge.userB);
        if (edge.userB === selectedNode) connectedNodes.add(edge.userA);
      }
    }

    const isDimmed = (userId: string): boolean =>
      selectedNode !== null && !connectedNodes.has(userId);

    const isEdgeDimmed = (edge: CoPresenceGraphData['edges'][0]): boolean =>
      selectedNode !== null && !connectedNodes.has(edge.userA) && !connectedNodes.has(edge.userB);

    // 엣지 그리기
    for (const edge of data.edges) {
      const a = posMap.get(edge.userA);
      const b = posMap.get(edge.userB);
      if (!a || !b) continue;

      ctx.globalAlpha = isEdgeDimmed(edge) ? EDGE_DIMMED_ALPHA : EDGE_NORMAL_ALPHA;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = computeEdgeWidth(edge.totalMinutes, maxEdgeMinutes);
      ctx.stroke();
    }

    // 노드 그리기
    for (const pos of positions) {
      const dimmed = isDimmed(pos.userId);
      ctx.globalAlpha = dimmed ? NODE_DIMMED_ALPHA : 1;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
      ctx.fillStyle = pos.color;
      ctx.fill();

      // 호버/선택 테두리
      if (pos.userId === hoveredNode || pos.userId === selectedNode) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    // 툴팁 (스크린 좌표 기준으로 그려야 하므로 restore 후 렌더링)
    if (hoveredNode) {
      const pos = posMap.get(hoveredNode);
      if (pos) {
        const stats = nodeStats();
        const stat = stats.get(hoveredNode);
        const screenX = pos.x * scale + offset.x;
        const screenY = pos.y * scale + offset.y;
        const tooltipY = screenY - pos.radius * scale - 8;

        ctx.font = 'bold ' + LABEL_FONT;
        const nameWidth = ctx.measureText(pos.label).width;
        ctx.font = TOOLTIP_FONT;
        const line1 = t('coPresence.graph.tooltip.activity', {
          value: formatMinutesI18n(stat?.totalMinutes ?? 0, tc),
        });
        const line2 = t('coPresence.graph.tooltip.connections', {
          count: stat?.connectionCount ?? 0,
        });
        const line1Width = ctx.measureText(line1).width;
        const line2Width = ctx.measureText(line2).width;
        const maxWidth = Math.max(nameWidth, line1Width, line2Width);

        const padding = 8;
        const lineHeight = 16;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = lineHeight * 3 + padding * 2 - 4;
        const boxX = screenX - boxWidth / 2;
        const boxY = tooltipY - boxHeight;

        // 배경
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        const r = 6;
        ctx.moveTo(boxX + r, boxY);
        ctx.lineTo(boxX + boxWidth - r, boxY);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + r);
        ctx.lineTo(boxX + boxWidth, boxY + boxHeight - r);
        ctx.quadraticCurveTo(
          boxX + boxWidth,
          boxY + boxHeight,
          boxX + boxWidth - r,
          boxY + boxHeight,
        );
        ctx.lineTo(boxX + r, boxY + boxHeight);
        ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - r);
        ctx.lineTo(boxX, boxY + r);
        ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
        ctx.closePath();
        ctx.fill();

        // 텍스트
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + LABEL_FONT;
        ctx.fillText(pos.label, screenX, boxY + padding + lineHeight - 2);
        ctx.font = TOOLTIP_FONT;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(line1, screenX, boxY + padding + lineHeight * 2 - 4);
        ctx.fillText(line2, screenX, boxY + padding + lineHeight * 3 - 6);
      }
    }

    // 범례 (우하단)
    renderLegend(ctx, width, height, {
      title: t('coPresence.graph.legend.title'),
      nodeSize: t('coPresence.graph.legend.nodeSize'),
      edgeWidth: t('coPresence.graph.legend.edgeWidth'),
    });
  }, [positions, data.edges, hoveredNode, selectedNode, scale, offset, nodeStats, t, tc]);

  useEffect(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(render);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [render]);

  // canvas 리사이즈
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = 480;
      render();
    });
    observer.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = 480;
    return () => observer.disconnect();
  }, [render]);

  // 마우스 휠: 줌
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = 1 - e.deltaY * ZOOM_SENSITIVITY;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));

      // 마우스 포인터 위치 기준 줌
      const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / scale);
      const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / scale);

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [scale, offset]);

  // 마우스 이벤트: 호버
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const drag = dragRef.current;

    // 드래그 중
    if (drag.type === 'pan') {
      const dx = screenX - drag.startX;
      const dy = screenY - drag.startY;
      setOffset({
        x: drag.startOffsetX + dx,
        y: drag.startOffsetY + dy,
      });
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (drag.type === 'node' && drag.nodeId) {
      const dx = (screenX - drag.startX) / scale;
      const dy = (screenY - drag.startY) / scale;
      setPositions((prev) =>
        prev.map((p) =>
          p.userId === drag.nodeId ? { ...p, x: drag.startNodeX + dx, y: drag.startNodeY + dy } : p,
        ),
      );
      canvas.style.cursor = 'grabbing';
      return;
    }

    // 호버 감지
    const { wx, wy } = screenToWorld({ screenX, screenY, scale, offset });
    const hit = hitTestNode({ wx, wy, positions });
    setHoveredNode(hit?.userId ?? null);
    canvas.style.cursor = hit ? 'pointer' : 'default';
  };

  // 마우스 이벤트: 드래그 시작 (pan 또는 node drag)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const { wx, wy } = screenToWorld({ screenX, screenY, scale, offset });
    const hit = hitTestNode({ wx, wy, positions });

    if (hit) {
      // 노드 드래그
      dragRef.current = {
        type: 'node',
        nodeId: hit.userId,
        startX: screenX,
        startY: screenY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startNodeX: hit.x,
        startNodeY: hit.y,
      };
    } else {
      // 캔버스 팬
      dragRef.current = {
        type: 'pan',
        startX: screenX,
        startY: screenY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startNodeX: 0,
        startNodeY: 0,
      };
    }

    canvas.style.cursor = 'grabbing';
  };

  // 마우스 이벤트: 드래그 종료
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const hasMoved = Math.abs(screenX - drag.startX) > 3 || Math.abs(screenY - drag.startY) > 3;

    // 드래그 없이 클릭한 경우에만 선택 토글
    if (!hasMoved) {
      const { wx, wy } = screenToWorld({ screenX, screenY, scale, offset });
      const hit = hitTestNode({ wx, wy, positions });
      if (hit) {
        setSelectedNode((prev) => (prev === hit.userId ? null : hit.userId));
      } else {
        setSelectedNode(null);
      }
    }

    dragRef.current = {
      type: 'none',
      startX: 0,
      startY: 0,
      startOffsetX: 0,
      startOffsetY: 0,
      startNodeX: 0,
      startNodeY: 0,
    };
    canvas.style.cursor = 'default';
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    if (dragRef.current.type !== 'none') {
      dragRef.current = {
        type: 'none',
        startX: 0,
        startY: 0,
        startOffsetX: 0,
        startOffsetY: 0,
        startNodeX: 0,
        startNodeY: 0,
      };
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onMinMinutesChange(value);
    }, DEBOUNCE_MS);
  };

  const isZoomed = scale !== 1 || offset.x !== 0 || offset.y !== 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>{t('coPresence.graph.title')}</CardTitle>
          <div className="flex items-center gap-3">
            {isZoomed && (
              <button
                type="button"
                onClick={handleResetView}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {t('coPresence.graph.resetView')}
              </button>
            )}
            <label
              htmlFor="min-minutes-slider"
              className="text-sm text-muted-foreground whitespace-nowrap"
            >
              {t('coPresence.graph.minThreshold', { value: minMinutes })}
            </label>
            <input
              id="min-minutes-slider"
              type="range"
              min={1}
              max={120}
              defaultValue={minMinutes}
              onChange={handleSliderChange}
              className="w-28 accent-indigo-600"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[480px] items-center justify-center rounded-lg bg-muted/30">
            <div className="text-muted-foreground">{t('coPresence.graph.updating')}</div>
          </div>
        ) : data.nodes.length === 0 ? (
          <div className="flex h-[480px] items-center justify-center rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground">{t('coPresence.graph.noData')}</p>
          </div>
        ) : (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full rounded-lg bg-gray-50"
              style={{ height: 480 }}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
            <p className="mt-2 text-xs text-muted-foreground">{t('coPresence.graph.hint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 범례 렌더링 ──────────────────────────────────────────────────────────────

interface LegendLabels {
  title: string;
  nodeSize: string;
  edgeWidth: string;
}

function renderLegend(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  labels: LegendLabels,
) {
  const padding = 10;
  const lineHeight = 18;
  const legendWidth = 160;
  const legendHeight = lineHeight * 4 + padding * 2;
  const x = canvasWidth - legendWidth - 12;
  const y = canvasHeight - legendHeight - 12;

  // 배경
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const r = 6;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + legendWidth - r, y);
  ctx.quadraticCurveTo(x + legendWidth, y, x + legendWidth, y + r);
  ctx.lineTo(x + legendWidth, y + legendHeight - r);
  ctx.quadraticCurveTo(x + legendWidth, y + legendHeight, x + legendWidth - r, y + legendHeight);
  ctx.lineTo(x + r, y + legendHeight);
  ctx.quadraticCurveTo(x, y + legendHeight, x, y + legendHeight - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  let curY = y + padding + 12;

  // 제목
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(labels.title, x + padding, curY);
  curY += lineHeight + 2;

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#64748b';

  // 노드 크기
  ctx.beginPath();
  ctx.arc(x + padding + 5, curY - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#6366F1';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + padding + LEGEND_NODE_LARGE_OFFSET, curY - 4, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#6366F1';
  ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.fillText(labels.nodeSize, x + padding + 30, curY);
  curY += lineHeight;

  // 엣지 두께
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + padding, curY - 4);
  ctx.lineTo(x + padding + 24, curY - 4);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + padding, curY - 4 + 8);
  ctx.lineTo(x + padding + 24, curY - 4 + 8);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.fillText(labels.edgeWidth, x + padding + 30, curY + 2);
}
