import type { ComponentType } from "react";

export type HomeCard = {
  id: string;
  label: string;
  description: string;
  icon: ComponentType;
  iconBg: string;
};

export const HomePanel: React.FC<{
  cards: HomeCard[];
  onSelect: (id: string) => void;
}> = ({ cards, onSelect }) => {
  return (
    <div className="flex-1 overflow-y-auto p-10">
      <h1 className="text-3xl font-bold text-foreground mb-1">기능 살펴보기</h1>
      <p className="text-sm text-subtitle mb-8">
        영상 템플릿과 도구를 골라 바로 시작하세요.
      </p>
      <div className="grid grid-cols-3 gap-4 max-w-4xl">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className="text-left flex flex-col gap-3 p-5 rounded-geist border border-unfocused-border-color bg-white/[0.02] transition-colors duration-150 ease-in-out hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-geist"
                style={{ background: card.iconBg }}
              >
                <Icon />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground mb-1">{card.label}</div>
                <div className="text-xs text-subtitle leading-relaxed">{card.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
