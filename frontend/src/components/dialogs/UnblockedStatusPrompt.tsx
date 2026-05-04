import { Modal } from '../ui/Modal';

export interface UnblockedStatusOption {
  value: string;
  label: string;
}

export interface UnblockedStatusPromptData {
  nodeId: string;
  nodeName: string;
  statusPropertyId: string;
  currentValue: unknown;
  options: UnblockedStatusOption[];
}

interface Props {
  prompt: UnblockedStatusPromptData | null;
  onSelect: (value: string) => void;
  onSkip: () => void;
}

/**
 * Shown after a blocking relationship is removed from a node whose status is
 * still "Blocked". Lets the user pick a non-blocked status, or keep current.
 */
export function UnblockedStatusPrompt({ prompt, onSelect, onSkip }: Props) {
  const isOpen = prompt !== null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onSkip}
      title="Update status?"
      size="sm"
    >
      {prompt && (
        <div className="space-y-3">
          <p className="text-sm text-fg-primary">
            <span className="font-semibold">{prompt.nodeName}</span> is no longer
            blocked. Choose a new status:
          </p>
          <div className="flex flex-col gap-2">
            {prompt.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className="w-full text-left px-3 py-2 rounded border border-border bg-bg-dark/40 hover:bg-bg-selection text-fg-primary transition-colors"
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={onSkip}
              className="w-full text-left px-3 py-2 rounded border border-border text-fg-secondary hover:bg-bg-selection transition-colors text-sm"
            >
              Keep "Blocked"
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
