# Apology Pizza study plan

Recorded before study outputs. Source: 827bcf6330e082f6e400db21912fa02d0fd12baa, package 0.2.0.
No study data exist yet. Source inspection identifies the message-content gap.
The honesty pilot supplies only layout, statistics, and build helpers.
This is a local prospective plan, not an independently registered study.
No venue deposit, paid inference, publication, or merge is authorized.

## Questions and fixed design
H1: a policy scripted from scenario inputs completes every public task.
H2: empty, constant, echo, refuse, and first-tool policies never complete a task.
H3: removing verification or the final message reduces full completion.
H4: replacing the final message with unrelated text leaves the score unchanged.
H5 (simulated): forcing verification and messaging increases completion under omissions.
Use all 40 public tasks, with no task exclusions or task generation.
Baselines: empty, constant, echo, refuse, first-tool, policy, no-lookup, no-message,
generic-message, always-escalate, always-remake, and over-cap refund.
All scripts are local. The policy reads task input, not expected answers.
They are diagnostic controls, not learned agents or blind language baselines.
First-tool repeats lookup_order with empty arguments. Over-cap uses 999 dollars.

## Simulated population and control ablation
Use omission probabilities 0, 0.25, 0.5, 0.75, 1 and seeds 1 through 8.
For each task independently omit lookup and final messaging using seeded draws.
Keep the scenario-specific remedy and amount correct. Share draws across controls.
Controls: none, force lookup, force message, force both. Do not alter tool enforcement.
Run all 160 simulated cells through the public runner and repeat every cell.
The simulated cells contain 6400 episodes per pass; they are not new task samples.

## Analysis and stopping
Primary outcome: score equals 1. Secondary: score mean and any recorded violation.
Report Wilson 95% intervals over baseline tasks, explicitly as hypothetical sampling intervals.
Report mean scores with a scenario-stratified percentile bootstrap, 2000 draws.
For simulated outcomes, bootstrap eight seed-level means, 2000 draws, seed 20261029.
Pair simulated contrasts by seed and task, relative to no forced controls.
Report all nulls; no significance tests or post hoc policy selection.
Stop after every cell and its identical repeat. No retries; errors abort the run.
Keep raw tool logs, grades, summary data, and semantic hashes for repeats.
No human validation or free hosted model arm is included; access is not tested.

## Failure modes to check before implementation
Wrong policy amounts; mismatched task IDs; dropped failed calls; silent early stopping;
message content confused with message presence; reused randomness across distinct seeds;
repeat timings confused with semantic changes; task repetitions treated as independent items;
unlabelled simulations; figures detached from source data; template changes.
Verification must re-grade saved traces and recompute summaries through public code.

## Execution note, 2026-10-29
The first attempt aborts before saving data: incomplete scripts lack a terminal turn.
Append a text-only terminal turn after scripted actions. This preserves omission conditions.
The empty-policy smoke check confirms the public runner accepts an empty response.
No policy or hypothesis changes; rerun the full grid after this adapter correction.
