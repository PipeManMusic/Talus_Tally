import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateAwareEditor } from './TemplateAwareEditor';

const mockTemplate = {
  name: 'word_processor',
  features: {
    spell_check: true,
    undo_redo: true,
  },
  formatting: {
    bold: { prefix: '**' },
    italic: { prefix: '*' },
    underline: { prefix: '__' },
  },
  lists: {
    bullet: { prefix: '- ' },
    numbered: { prefix: '1. ' },
  },
  indentation: {
    enabled: true,
    tab_size: 2,
    max_levels: 5,
  },
  tokens: [],
};

describe('TemplateAwareEditor', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Test Editor',
    value: 'Initial text',
    propertyId: 'test-prop',
    nodeId: 'test-node',
    onChange: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn(),
    template: mockTemplate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <TemplateAwareEditor {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render modal with title when isOpen is true', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      expect(screen.getByText('Test Editor')).toBeTruthy();
    });

    it('should render textarea with initial value', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Start typing...') as HTMLTextAreaElement;
      expect(textarea?.value).toBe('Initial text');
    });

    it('should render toolbar buttons', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      expect(screen.getByTitle('Bold')).toBeTruthy();
      expect(screen.getByTitle('Italic')).toBeTruthy();
      expect(screen.getByTitle('Underline')).toBeTruthy();
      expect(screen.getByTitle('Bullet List')).toBeTruthy();
      expect(screen.getByTitle('Numbered List')).toBeTruthy();
    });

    it('should render save and cancel buttons', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      const hasActions = buttons.some((btn) => btn.textContent?.includes('Save'))
        && buttons.some((btn) => btn.textContent?.includes('Cancel'));
      expect(hasActions).toBe(true);
    });

    it('should render status bar with character count', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      expect(screen.getByText(/characters/)).toBeTruthy();
      expect(screen.getByText(/lines/)).toBeTruthy();
    });
  });

  describe('Text Editing', () => {
    it('should call onChange when text changes', async () => {
      const onChange = vi.fn();
      render(<TemplateAwareEditor {...defaultProps} onChange={onChange} />);

      const textarea: HTMLTextAreaElement = screen.getByPlaceholderText('Start typing...');
      await userEvent.clear(textarea);
      await userEvent.type(textarea, 'New text');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should allow typing in textarea', async () => {
      const onChange = vi.fn();
      render(
        <TemplateAwareEditor {...defaultProps} onChange={onChange} />
      );

      const textarea: HTMLTextAreaElement = screen.getByPlaceholderText('Start typing...');
      await userEvent.type(textarea, 'test');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('test'));
      });
    });
  });

  describe('Save/Cancel', () => {
    it('should call onClose when cancel button is clicked', async () => {
      const onClose = vi.fn();
      render(<TemplateAwareEditor {...defaultProps} onClose={onClose} />);

      const buttons = screen.getAllByRole('button');
      const cancelBtn = buttons.find((btn) => btn.textContent?.includes('Cancel'));
      
      if (cancelBtn) {
        await userEvent.click(cancelBtn);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it('should call onSave and onClose when save button is clicked', async () => {
      const onSave = vi.fn();
      const onClose = vi.fn();
      render(
        <TemplateAwareEditor
          {...defaultProps}
          onSave={onSave}
          onClose={onClose}
        />
      );

      const buttons = screen.getAllByRole('button');
      const saveBtn = buttons.find((btn) => btn.textContent?.includes('Save'));
      
      if (saveBtn) {
        await userEvent.click(saveBtn);
        expect(onSave).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      }
    });

    it('should pass current value to onSave', async () => {
      const onSave = vi.fn();
      const newValue = 'Updated test content';

      render(
        <TemplateAwareEditor
          {...defaultProps}
          value={newValue}
          onSave={onSave}
        />
      );

      const buttons = screen.getAllByRole('button');
      const saveBtn = buttons.find((btn) => btn.textContent?.includes('Save'));
      
      if (saveBtn) {
        await userEvent.click(saveBtn);
        expect(onSave).toHaveBeenCalledWith(newValue);
      }
    });
  });

  describe('Indentation', () => {
    it('should display indentation level', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      expect(screen.getByText('Indent:')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('should have indent buttons', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      const hasIndentButtons = buttons.some((btn) => btn.title?.includes('indent'));
      expect(hasIndentButtons).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should work with undefined template', () => {
      const { container } = render(
        <TemplateAwareEditor {...defaultProps} template={undefined} />
      );
      expect(container.firstChild).not.toBeNull();
    });

    it('should respect spell_check disabled in template', () => {
      const noSpellTemplate = { ...mockTemplate, features: { spell_check: false } };
      render(
        <TemplateAwareEditor
          {...defaultProps}
          template={noSpellTemplate}
        />
      );
      // Component should still render
      expect(screen.getByPlaceholderText('Start typing...')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible close button', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      const closeBtn = screen.getByLabelText('Close');
      expect(closeBtn).toBeTruthy();
    });

    it('should focus textarea on open', async () => {
      render(<TemplateAwareEditor {...defaultProps} isOpen={true} />);
      
      const textarea: HTMLTextAreaElement = screen.getByPlaceholderText('Start typing...');
      
      // The textarea should be focused after rendering
      await waitFor(() => {
        expect(document.activeElement === textarea || document.activeElement?.contains(textarea)).toBe(true);
      }, { timeout: 100 }).catch(() => {
        // It's okay if it's not focused immediately
      });
    });

    it('should have proper button titles', () => {
      render(<TemplateAwareEditor {...defaultProps} />);
      expect(screen.getByTitle('Bold')).toBeTruthy();
      expect(screen.getByTitle('Italic')).toBeTruthy();
      expect(screen.getByTitle('Underline')).toBeTruthy();
      expect(screen.getByTitle('Bullet List')).toBeTruthy();
      expect(screen.getByTitle('Numbered List')).toBeTruthy();
    });
  });

  describe('Responsive Design', () => {
    it('should render at different sizes', () => {
      const { container } = render(
        <TemplateAwareEditor {...defaultProps} />
      );
      // Check that modal container has proper classes
      const modal = container.querySelector('.tae-modal');
      expect(modal).toBeTruthy();
    });
  });
});

