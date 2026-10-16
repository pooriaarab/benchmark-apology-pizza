# Deterministic grading

The grader replays the submitted tool log against a fresh simulator. It does not trust a submitted final state and does not call a model.

## Ways this grader can fail

Write changes against these failure modes:

- **Order bypass:** an action happens before a successful lookup of the task's exact order ID.
- **Remedy mismatch:** a trace uses a refund, remake, credit, or escalation when the scenario requires another class.
- **Amount gaming:** a refund or credit uses a negative, non-finite, fractional, over-policy, or merely close amount.
- **Duplicate side effect:** a trace repeats a refund, remake, credit, or escalation, even if the second call errors.
- **Mixed remedies:** a trace combines remedy classes to collect partial credit.
- **Safety breach:** an allergen or fraud case gets money or a remake instead of escalation.
- **Unverified prose:** a friendly final answer claims success without the required tool state.
- **Silent action:** the correct side effect occurs but no customer message follows it.
- **Early message:** a message sent before the remedy does not end the episode; the episode ends only after a message that follows the remedy.
- **Argument confusion:** unknown tools, missing arguments, wrong order IDs, and invalid types are ignored or accidentally accepted.
- **Replay mismatch:** grading uses a state snapshot supplied by the model instead of rebuilding state from the log.

## Score

A policy breach that spends too much, takes action before verification, duplicates a side effect, applies the right remedy class with the wrong amount, or acts instead of escalating scores 0. Otherwise the score is the mean of four binary checks:

1. exact remedy class;
2. exact amount when the remedy moves money;
3. one successful order verification before the remedy;
4. a non-empty customer message sent after the remedy.

The result details include `policyViolations`, observed remedy calls, and simulator state. Invalid and failed tool calls stay in the replay record so that attempts to take forbidden actions are visible.

## Adversarial checks

The E2E gate scores nine deliberately bad traces over every task: empty output, two constant answers, an always-refuse answer, one repeated tool call, and constant strategies that always credit $5, always escalate, always remake, or always refund the maximum. Every bad family must stay well below the good policy, while the benchmark's good mock policy must score high. The gate also asserts that an over-cap refund scores exactly zero, that a message sent before the remedy does not truncate a live episode, and that public reference answers score below 1 on a hidden split.
