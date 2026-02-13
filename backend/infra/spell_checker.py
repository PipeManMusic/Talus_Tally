"""
Spell Checker Infrastructure Layer

Provides spell checking services for text editor with support for
custom dictionaries and project-specific terminology.
"""

from typing import List, Dict, Set, Optional, Any
from dataclasses import dataclass
import re
import json
import os

try:
    from spellchecker import SpellChecker as PySpellChecker
    SPELLCHECKER_AVAILABLE = True
except ImportError:
    SPELLCHECKER_AVAILABLE = False


@dataclass
class SpellingSuggestion:
    """Represents a spelling suggestion for a misspelled word"""
    word: str
    suggestions: List[str]
    position: int
    context: str  # Surrounding text for context


class SpellCheckerService:
    """
    Spell checking service with support for custom dictionaries.
    
    Uses pyspellchecker if available, falls back to simple word list.
    Supports:
    - Custom project dictionaries
    - Technical/domain-specific terms
    - Case-insensitive checking
    - Contextual suggestions
    """
    
    def __init__(self):
        if SPELLCHECKER_AVAILABLE:
            self.spell_checker = PySpellChecker()
            # Add common technical/project terms
            self.spell_checker.word_frequency.load_words([
                'talus', 'markup', 'workflow', 'node', 'asset', 'milestone',
                'screenplay', 'todo', 'ui', 'api', 'backend', 'frontend'
            ])
        else:
            self.spell_checker = None
            
        self.base_dictionary: Set[str] = self._load_base_dictionary()
        self.proper_nouns: Set[str] = self._load_proper_nouns()
        self.custom_dictionary: Set[str] = set()
        self.ignore_list: Set[str] = set()
        
        # Add proper nouns to spell checker if available
        if SPELLCHECKER_AVAILABLE and self.spell_checker and self.proper_nouns:
            self.spell_checker.word_frequency.load_words(list(self.proper_nouns))
        
    def _load_base_dictionary(self) -> Set[str]:
        """Load base English dictionary"""
        # Common English words - in production, load from a file or use enchant/pyspellchecker
        base_words = {
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
            'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
            'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
            'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
            'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
            'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
            'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
            'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day',
            'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had', 'were', 'said', 'did',
            # Technical terms commonly used in project management
            'project', 'task', 'milestone', 'deadline', 'priority', 'status', 'workflow',
            'template', 'node', 'asset', 'property', 'indicator', 'velocity', 'blocking',
            'markdown', 'script', 'scene', 'character', 'dialogue', 'action', 'description'
        }
        base_words.update({
            "ain't", "aren't", "can't", "couldn't", "didn't", "doesn't", "don't",
            "hadn't", "hasn't", "haven't", "he'd", "he'll", "he's", "i'd", "i'll",
            "i'm", "i've", "isn't", "it's", "let's", "she'd", "she'll", "she's",
            "shouldn't", "that's", "there's", "they'd", "they'll", "they're", "they've",
            "wasn't", "we'd", "we'll", "we're", "we've", "weren't", "what's", "where's",
            "who's", "won't", "wouldn't", "you'd", "you'll", "you're", "you've"
        })
        return base_words
    
    def _load_proper_nouns(self) -> Set[str]:
        """Load supplementary proper nouns dictionary from JSON file"""
        proper_nouns = set()
        
        # Try to load from data/dictionaries/proper_nouns.json
        possible_paths = [
            os.path.join(os.path.dirname(__file__), '../../data/dictionaries/proper_nouns.json'),
            'data/dictionaries/proper_nouns.json',
            '/home/dworth/Dropbox/Bronco II/Talus Tally/data/dictionaries/proper_nouns.json'
        ]
        
        for path in possible_paths:
            try:
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if 'proper_nouns' in data and isinstance(data['proper_nouns'], list):
                            proper_nouns = set(word.lower() for word in data['proper_nouns'])
                            print(f"Loaded {len(proper_nouns)} proper nouns from {path}")
                            return proper_nouns
            except Exception as e:
                continue
        
        return proper_nouns
    
    def add_to_custom_dictionary(self, word: str) -> None:
        """Add a word to the custom dictionary"""
        self.custom_dictionary.add(word.lower())
    
    def add_to_ignore_list(self, word: str) -> None:
        """Add a word to the ignore list for current session"""
        self.ignore_list.add(word.lower())
    
    def is_word_valid(self, word: str) -> bool:
        """Check if a word is spelled correctly"""
        normalized = word.replace("'", "")
        if not word or not normalized.isalpha():
            return True  # Skip non-alphabetic strings
        
        word_lower = word.lower()
        
        # Check if in ignore list
        if word_lower in self.ignore_list:
            return True
        
        # Check proper nouns dictionary
        if word_lower in self.proper_nouns:
            return True
        
        # Check custom dictionary
        if word_lower in self.custom_dictionary:
            return True
        
        # Use pyspellchecker if available
        if SPELLCHECKER_AVAILABLE and self.spell_checker:
            # SpellChecker returns None if word is correctly spelled
            return word_lower not in self.spell_checker.unknown([word_lower])
        
        # Fallback to basic dictionary
        return word_lower in self.base_dictionary
    
    def generate_suggestions(self, word: str, max_suggestions: int = 5) -> List[str]:
        """Generate spelling suggestions for a misspelled word"""
        word_lower = word.lower()
        
        # Use pyspellchecker if available
        if SPELLCHECKER_AVAILABLE and self.spell_checker:
            candidates = self.spell_checker.candidates(word_lower)
            if candidates:
                return list(candidates)[:max_suggestions]
        
        # Fallback to basic edit distance
        suggestions = []
        all_words = self.base_dictionary.union(self.custom_dictionary)
        
        # Find words with similar length (±2 characters)
        similar_length = [
            w for w in all_words
            if abs(len(w) - len(word_lower)) <= 2
        ]
        
        # Calculate edit distance and rank suggestions
        ranked_suggestions = []
        for candidate in similar_length:
            distance = self._edit_distance(word_lower, candidate)
            if distance <= 2:  # Only suggest words within edit distance of 2
                ranked_suggestions.append((distance, candidate))
        
        # Sort by edit distance and return top suggestions
        ranked_suggestions.sort(key=lambda x: x[0])
        suggestions = [word for _, word in ranked_suggestions[:max_suggestions]]
        
        return suggestions
    
    def _edit_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein edit distance between two strings"""
        if len(s1) < len(s2):
            return self._edit_distance(s2, s1)
        
        if len(s2) == 0:
            return len(s1)
        
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                # Cost of insertions, deletions, or substitutions
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        
        return previous_row[-1]
    
    def check_text(self, text: str) -> List[SpellingSuggestion]:
        """Check spelling of all words in text"""
        misspellings = []
        
        # Extract words and their positions
        word_pattern = re.compile(r"\b[a-zA-Z]+(?:'[a-zA-Z]+)*\b")
        for match in word_pattern.finditer(text):
            word = match.group()
            if not self.is_word_valid(word):
                # Get context (20 chars before and after)
                start = max(0, match.start() - 20)
                end = min(len(text), match.end() + 20)
                context = text[start:end]
                
                misspellings.append(SpellingSuggestion(
                    word=word,
                    suggestions=self.generate_suggestions(word),
                    position=match.start(),
                    context=context
                ))
        
        return misspellings
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get spell checker statistics"""
        return {
            'base_dictionary_size': len(self.base_dictionary),
            'proper_nouns_size': len(self.proper_nouns),
            'custom_dictionary_size': len(self.custom_dictionary),
            'ignore_list_size': len(self.ignore_list)
        }
