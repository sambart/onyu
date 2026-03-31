import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface StepSectionProps {
  stepNumber: number;
  title: string;
  children: ReactNode;
  hasConnector?: boolean;
}

export function StepSection({ stepNumber, title, children, hasConnector = false }: StepSectionProps) {
  return (
    <div className="relative">
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
            {stepNumber}
          </span>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        {children}
      </section>
      {hasConnector && (
        <div className="flex justify-center py-2">
          <ChevronDown className="w-5 h-5 text-gray-300" />
        </div>
      )}
    </div>
  );
}
