"""Automatic filler-word detection over a WhisperX word list.

Given the word list the web UI shows on the 텍스트 편집 tab
([{"word": str, "start": float, "end": float}, ...] -- same shape
web/app.py builds for transcribe jobs), flag the words a user will
probably want to strike out: hesitation fillers (음, 어…, um, uh, ...)
and stutters/re-takes (immediately repeated words).

Detection is deliberately conservative -- a false positive strikes out a
word the user meant to keep, while a miss just leaves them one click away
in the UI. Rules, in order:

1. UNAMBIGUOUS_FILLERS match standalone (after normalization) and are
   always flagged.
2. Consecutive duplicate words ("그 그", "제가 제가") flag every
   occurrence but the last, whether or not the word is a known filler --
   this is what catches stutters and re-takes generally, and it's also
   the contextual signal that lets ambiguous fillers (그/어/아/이제/약간/막,
   which are all legitimate Korean words too) be flagged at all.
3. A CONTEXTUAL_FILLERS word trailing off into an ellipsis ("어…", "그...")
   is a hesitation marker and is flagged standalone.

Pure stdlib, no ML. Both language lists are always active regardless of
the `language` argument -- exact-match tokens can't collide across
Korean/English, so this is safe; the parameter exists so per-language
tuning can be added later without changing the call sites.

Usage (library):
    from filler_detect import detect_fillers
    flags = detect_fillers(words, language="ko")  # parallel list[bool]

Self-test:
    ./venv/bin/python scripts/filler_detect.py
"""

# Fillers that are (as standalone transcript tokens) essentially never a
# legitimate word -- safe to flag on exact match alone.
UNAMBIGUOUS_FILLERS = frozenset({
    # Korean
    "음", "저기", "뭐랄까", "에", "으",
    # English (note: "like" is deliberately absent -- too ambiguous;
    # multi-word fillers like "you know" are out of scope for v1)
    "um", "uh", "uhm", "er", "hmm",
})

# Also legitimate Korean words (그 = that, 아 = ah!, 이제 = now, 약간 = a
# bit, 막 = just/carelessly, 뭐지 = "what is it?") -- only flagged with a
# contextual signal: immediate repetition, or a trailing ellipsis.
CONTEXTUAL_FILLERS = frozenset({
    "그", "어", "아", "이제", "약간", "막", "뭐지",
})

# Punctuation/quotes stripped off both ends before matching.
_STRIP_CHARS = " \t\r\n.,!?…~‥·。、！？'\"“”‘’()[]{}"


def normalize_word(word):
    """Strip surrounding punctuation/whitespace, lowercase Latin."""
    return word.strip(_STRIP_CHARS).lower()


def _has_trailing_ellipsis(word):
    """True if the raw token trails off into … or two-plus dots ("어…", "그...!")."""
    w = word.strip().rstrip(" '\"“”‘’)]},!?~")
    return w.endswith("…") or w.endswith("..")


def detect_fillers(words, language="ko"):
    """Flag likely filler words in a transcript word list.

    words: [{"word": str, "start": float, "end": float}, ...] -- the same
    list web/app.py builds for transcribe jobs. Returns a list[bool] of the
    same length; True = filler-word candidate the user will probably cut.

    language is accepted for future per-language tuning; v1 matches both
    the Korean and English lists regardless (exact-match tokens don't
    collide across the two).
    """
    norms = [normalize_word(w["word"]) for w in words]
    flags = [False] * len(words)

    for i, norm in enumerate(norms):
        if not norm:
            continue  # pure-punctuation token -- never flag, never counts as a duplicate
        if norm in UNAMBIGUOUS_FILLERS:
            flags[i] = True
        elif i + 1 < len(norms) and norms[i + 1] == norm:
            # Stutter/re-take: flag every occurrence in a run but the last.
            # This is also the repetition signal for CONTEXTUAL_FILLERS.
            flags[i] = True
        elif norm in CONTEXTUAL_FILLERS and _has_trailing_ellipsis(words[i]["word"]):
            flags[i] = True

    return flags


def _make_words(tokens):
    """Build a word list in the app.py shape from plain strings."""
    return [
        {"word": tok, "start": i * 0.5, "end": i * 0.5 + 0.4}
        for i, tok in enumerate(tokens)
    ]


def _self_test():
    cases = [
        ("empty list",
         [], []),
        ("all unambiguous fillers (ko + en)",
         ["음", "um", "저기", "hmm"],
         [True, True, True, True]),
        ("stutter / re-take: flag all but last",
         ["제가", "제가", "말했어요"],
         [True, False, False]),
        ("triple repeat",
         ["네", "네", "네"],
         [True, True, False]),
        ("legit 그 usage must NOT be flagged",
         ["그", "사람이", "정말", "좋아요"],
         [False, False, False, False]),
        ("repeated contextual filler 그 그",
         ["그", "그", "사람이"],
         [True, False, False]),
        ("repeated 어 어",
         ["어", "어", "맞아요"],
         [True, False, False]),
        ("standalone 어 without context: NOT flagged",
         ["어", "디로", "갈까"],
         [False, False, False]),
        ("어… with ellipsis: flagged standalone",
         ["어…", "그러니까요"],
         [True, False]),
        ("그... with ascii ellipsis: flagged standalone",
         ["그...", "영화", "봤어요"],
         [True, False, False]),
        ("legit 이제 / 약간 / 막: NOT flagged",
         ["이제", "시작합니다", "약간", "어렵네요", "막", "달렸어요"],
         [False, False, False, False, False, False]),
        ("repeated 이제 이제",
         ["이제", "이제", "시작해요"],
         [True, False, False]),
        ("english sentence with um/uh, 'like' stays unflagged",
         ["Um,", "I", "like", "it", "uh", "a", "lot"],
         [True, False, False, False, True, False, False]),
        ("uppercase + punctuation normalization",
         ["UM", "Uh...", "So,"],
         [True, True, False]),
        ("duplicate detection compares normalized forms",
         ["그,", "그", "사람"],
         [True, False, False]),
        ("non-adjacent repeats are NOT flagged",
         ["정말", "좋아요", "정말"],
         [False, False, False]),
        ("pure punctuation tokens never flag, never pair as duplicates",
         ["...", "...", "네"],
         [False, False, False]),
        ("mixed ko/en with everything at once",
         ["음", "오늘은", "그", "그", "영화를", "uh", "봤는데", "봤는데", "재밌었어요"],
         [True, False, True, False, False, True, True, False, False]),
        ("all fillers",
         ["음", "어…", "저기", "um"],
         [True, True, True, True]),
    ]

    failed = 0
    for name, tokens, expected in cases:
        got = detect_fillers(_make_words(tokens))
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}: {name}")
        if not ok:
            failed += 1
            print(f"      tokens:   {tokens}")
            print(f"      expected: {expected}")
            print(f"      got:      {got}")

    print(f"{len(cases) - failed}/{len(cases)} case(s) passed")
    assert failed == 0, f"{failed} self-test case(s) failed"


if __name__ == "__main__":
    _self_test()
