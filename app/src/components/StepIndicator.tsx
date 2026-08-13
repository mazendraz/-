import Icon from "./Icon";

export type StepState = "done" | "active" | "todo";

/**
 * Numbered-pill step progress (Provider "Complete Service" flow). No prior
 * component like this existed — every other multi-step flow in the app
 * (GuidedStart, RequestForm) hand-rolls its own back/next state with no visual
 * progress indicator.
 */
export default function StepIndicator({
  steps, current, onStepClick,
}: {
  steps: string[];
  /** 1-based index of the active step. */
  current: number;
  /** Omit to make the steps non-interactive (display only). */
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      {steps.map((label, i) => {
        const n = i + 1;
        const state: StepState = n === current ? "active" : n < current ? "done" : "todo";
        return (
          <div key={label} className="contents">
            <button
              type="button"
              onClick={() => onStepClick?.(n)}
              disabled={!onStepClick}
              className={`flex items-center gap-2 text-label font-bold whitespace-nowrap transition-colors ${
                state === "done" ? "text-primary" : state === "active" ? "text-on-surface" : "text-outline"
              } ${onStepClick ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-caption font-bold flex-shrink-0 box-border ${
                  state === "done"
                    ? "bg-primary text-on-primary"
                    : state === "active"
                      ? "bg-on-surface text-surface"
                      : "border border-outline-variant text-outline"
                }`}
              >
                {/* text-caption, not text-[14px]: the design system's 7 size
                    tokens are enforced by the no-restricted-syntax lint rule. */}
                {state === "done" ? <Icon name="check" className="text-caption" /> : n}
              </span>
              {label}
            </button>
            {n < steps.length && <span className="flex-1 min-w-6 h-px bg-outline-variant/40" />}
          </div>
        );
      })}
    </div>
  );
}
