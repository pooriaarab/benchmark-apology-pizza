# Apology Pizza research packet

Use Node 20+, npm, Python 3, Tectonic, and Poppler. From the repository root:

```sh
npm ci
sh paper/template/reproduce.sh
```

The command runs local scripts, renders three figures, builds the PDF, and verifies saved traces.
The output is `paper/apology-pizza-paper.pdf`. The PDF and downloaded style remain untracked.
The build downloads the official style archive and checks its pinned hash.
The experiment uses no network, provider credentials, or paid inference.
The paper and figures use CC-BY-4.0. Code and tasks retain MIT.

`PREREG.md` records the prospective design and the failed initial adapter attempt.
`config.json` pins the benchmark source. The template directory matches the accepted pilot unchanged.
`data/runs.generated.json` retains submissions, complete tool logs, scores, reasons, and replayed states.
`data/repeat.generated.json` records matching semantic hashes from fresh repeated runs.
`data/summary.generated.json` holds rates, intervals, coverage, and paired simulated contrasts.
`data/provenance.generated.json` records source hashes and the initial plan commit.
`data/verification.generated.json` records replay checks, page count, and the PDF hash.
The verifier replays every saved trace and recomputes baseline statistics and simulated completion contrasts.
The repeat command overwrites generated files. Regeneration preserves semantic experiment data.

The study evaluates scripted policies, not learned models. No free provider availability test occurs.
The simulated sweep holds tasks and remedy decisions fixed. It varies lookup and message omissions only.
Baseline intervals use hypothetical task sampling. Simulated intervals cover seed variation only.
The unrelated-message control passes, so scores do not establish message accuracy or service quality.
The initial plan uses version history, not an external registration service.
No publication deposit or merge is part of this packet.
