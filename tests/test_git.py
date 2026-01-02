import pytest
from unittest.mock import MagicMock, patch
import git 
from backend.git_manager import GitAutomation

def test_git_init_no_repo():
    """Verify it handles missing repos gracefully."""
    with patch("git.Repo") as MockRepo:
        # FIX: Raise the actual exception the code expects
        MockRepo.side_effect = git.exc.InvalidGitRepositoryError
        ga = GitAutomation()
        assert ga.enabled is False
        assert ga.repo is None

def test_push_update_success():
    """Verify the commit flow: Add -> Commit -> Push."""
    with patch("git.Repo") as MockRepo:
        mock_instance = MockRepo.return_value
        # Mock the remote 'origin'
        mock_remote = MagicMock()
        mock_instance.remote.return_value = mock_remote
        # Mock is_dirty to say "Yes, we have changes"
        mock_instance.is_dirty.return_value = True
        
        ga = GitAutomation()
        
        # We also mock os.path.exists so it thinks it found the files
        with patch("os.path.exists", return_value=True):
            result = ga.push_update("Fix Brakes")
            
        assert result is True
        
        # Check calls
        mock_instance.index.add.assert_called()
        # Verify commit message format
        args, _ = mock_instance.index.commit.call_args
        assert "Completed: Fix Brakes" in args[0]
        # Verify push
        mock_remote.push.assert_called()