'use client';

import { ChevronDown, ChevronUp, HelpCircle, MessageCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

// 디스코드 공개 문의 채널 초대 URL — 미설정 시 문의 버튼을 숨긴다
const SUPPORT_URL = process.env.NEXT_PUBLIC_DISCORD_SUPPORT_URL;

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

// ─── 아코디언 아이템 컴포넌트 ────────────────────────────────────────────────

interface AccordionItemProps {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}

function AccordionItem({ item, isOpen, onToggle }: AccordionItemProps) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-indigo-400" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5">
          <p className="text-sm leading-relaxed text-gray-600">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

// ─── 섹션 컴포넌트 ────────────────────────────────────────────────────────────

interface FaqSectionCardProps {
  section: FaqSection;
}

function FaqSectionCard({ section }: FaqSectionCardProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function handleToggle(idx: number) {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
      </div>
      <div>
        {section.items.map((item, idx) => (
          <AccordionItem
            key={item.question}
            item={item}
            isOpen={openIndex === idx}
            onToggle={() => handleToggle(idx)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ────────────────────────────────────────────────────────────

export default function HelpPage() {
  const t = useTranslations('dashboard');
  // guildId는 향후 서버별 도움말 컨텍스트에 활용 가능
  const params = useParams<{ guildId: string }>();
  void params.guildId;

  const faqSections: FaqSection[] = [
    {
      id: 'voice',
      title: t('help.sections.voice.title'),
      items: [
        { question: t('help.sections.voice.q1'), answer: t('help.sections.voice.a1') },
        { question: t('help.sections.voice.q2'), answer: t('help.sections.voice.a2') },
      ],
    },
    {
      id: 'gemini',
      title: t('help.sections.gemini.title'),
      items: [
        { question: t('help.sections.gemini.q1'), answer: t('help.sections.gemini.a1') },
        { question: t('help.sections.gemini.q2'), answer: t('help.sections.gemini.a2') },
      ],
    },
    {
      id: 'newbie',
      title: t('help.sections.newbie.title'),
      items: [
        { question: t('help.sections.newbie.q1'), answer: t('help.sections.newbie.a1') },
        { question: t('help.sections.newbie.q2'), answer: t('help.sections.newbie.a2') },
      ],
    },
    {
      id: 'inactive',
      title: t('help.sections.inactive.title'),
      items: [
        { question: t('help.sections.inactive.q1'), answer: t('help.sections.inactive.a1') },
        { question: t('help.sections.inactive.q2'), answer: t('help.sections.inactive.a2') },
      ],
    },
    {
      id: 'co-presence',
      title: t('help.sections.coPresence.title'),
      items: [
        { question: t('help.sections.coPresence.q1'), answer: t('help.sections.coPresence.a1') },
      ],
    },
    {
      id: 'auto-channel',
      title: t('help.sections.autoChannel.title'),
      items: [
        { question: t('help.sections.autoChannel.q1'), answer: t('help.sections.autoChannel.a1') },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <HelpCircle className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('help.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('help.subtitle')}</p>
          </div>
        </div>

        {/* FAQ 섹션 목록 */}
        <div className="space-y-4">
          {faqSections.map((section) => (
            <FaqSectionCard key={section.id} section={section} />
          ))}
        </div>

        {/* 추가 문의 안내 */}
        <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-center">
          <p className="text-sm font-medium text-indigo-900">{t('help.contactTitle')}</p>
          <p className="mt-1 text-sm text-indigo-700">
            {t('help.contactDesc', {
              command: '/help',
            })}
          </p>
          {SUPPORT_URL ? (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {t('help.contactDiscord')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
