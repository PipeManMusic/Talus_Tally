import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkupEditor } from './MarkupEditor';

const apiClientMock = vi.hoisted(() => ({
  listMarkupProfiles: vi.fn(),
  getMarkupProfile: vi.fn(),
  createMarkupProfile: vi.fn(),
  updateMarkupProfile: vi.fn(),
  deleteMarkupProfile: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiClient: apiClientMock,
}));

vi.mock('../components/layout/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}));

describe('MarkupEditor', () => {
  beforeEach(() => {
    apiClientMock.listMarkupProfiles.mockResolvedValue([]);
    apiClientMock.getMarkupProfile.mockResolvedValue(null);
    apiClientMock.createMarkupProfile.mockResolvedValue(undefined);
    apiClientMock.updateMarkupProfile.mockResolvedValue(undefined);
    apiClientMock.deleteMarkupProfile.mockResolvedValue(undefined);
  });

  it('allows typing a full token id after adding a new token row', async () => {
    const user = userEvent.setup();

    render(<MarkupEditor onClose={() => {}} />);

    await waitFor(() => expect(apiClientMock.listMarkupProfiles).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /new profile/i }));
    await user.click(screen.getByRole('button', { name: /add token/i }));

    const tokenIdInput = screen.getByPlaceholderText('scene');
    await user.type(tokenIdInput, 'scene_token');

    expect(screen.getByDisplayValue('scene_token')).toBeInTheDocument();
  });
});