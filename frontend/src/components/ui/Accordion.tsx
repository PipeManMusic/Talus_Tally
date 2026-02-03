import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: string;
  allowMultiple?: boolean;
}

export function Accordion({
  items,
  defaultOpen,
  allowMultiple = false,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(
    defaultOpen ? new Set([defaultOpen]) : new Set()
  );

  const toggle = (id: string) => {
    const newOpen = new Set(openItems);

    if (allowMultiple) {
      if (newOpen.has(id)) {
        newOpen.delete(id);
      } else {
        newOpen.add(id);
      }
    } else {
      newOpen.clear();
      if (!openItems.has(id)) {
        newOpen.add(id);
      }
    }

    setOpenItems(newOpen);
  };

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className={idx > 0 ? 'border-t border-border' : ''}
        >
          {/* Header */}
          <button
            onClick={() => toggle(item.id)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-bg-selection transition-colors"
          >
            <span className="font-semibold text-fg-primary">{item.title}</span>
            <ChevronDown
              size={18}
              className={`text-fg-secondary transition-transform ${
                openItems.has(item.id) ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Content */}
          {openItems.has(item.id) && (
            <div className="px-4 py-3 border-t border-border bg-bg-dark text-fg-secondary text-sm">
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
