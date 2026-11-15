# Mobile interaction contract for the revised rounds

The Product Owner asked for a comparison with existing couple apps and an
editorial rewrite. The round should start in seconds on one shared phone.
Each card gives both people something to do and a payoff such as a guess, a
reveal or a matching word. It takes approximately two to four minutes.

Baseline is [main at 3689a7ee6e](https://github.com/baerenmarke90/eimir/tree/3689a7ee6edd7b2ef5c33e604588c5c894d6f3e4)
and the previous Games shelf and open card in PR #1901 at `e2b560968`. The
three existing Games entries and More's selected navigation were reviewed.
The main changes since the original preflight did not change the Games shelf
or the perspective game.

## Published app comparison

| App | What people do | Application here |
| --- | --- | --- |
| [LovBirdz](https://mwm.ai/apps/lovbirdz-couple-love-quiz/6444805675) | Take turns guessing a hidden answer, then see how they did | Give a round a clear role change and a result. |
| [Paired](https://support.paired.com/en/articles/164633-what-s-paired-premium) | Choose couple games and quizzes that explore how well partners know each other | Use real decisions with two credible choices. The existing perspective game serves partner-attribution questions. |
| [Agapé](https://play.google.com/store/apps/details?id=com.getdailyagape) | Answer a daily question and read both responses when both are ready | Give a personal story a listening turn and a reveal. |
| [Lovewick](https://apps.apple.com/us/app/lovewick-relationship-tracker/id1516199115) | Play themed questions from a card deck without requiring the second partner to link an account | Let a couple start with one phone and a concrete opening line. |

Comparison uses public product descriptions. Prompts, rules copy, examples and
visuals are authored for eimir. The revision includes six rounds each of
film clues, true story endings, cooperative word matches and partner-choice
predictions. Distinct formats alternate and each film clue has a factual,
localized answer. The phone offers next-round navigation and the film reveal.

## Compact and expanded behavior

- More → Games keeps the existing shelf and opens the first round directly.
  The existing single-card task and shared screen anatomy (Screen Templates
  §2) govern composition. Title, estimated length, concise rules and a
  specific prompt appear on one page. The prompt carries the reading focus.
- On a film round, the primary action reveals the title. Skipping is
  secondary. After reveal, the answer appears in the same card and focus
  moves to it. The primary next-round action mounts the next prompt and
  moves focus to its heading. Oral rounds keep their reveal with the couple
  and use the same next-round action. The last round cycles to the first.
- Back uses the existing upper-left shell control and restores focus to the
  shelf entry. No text input is needed. One fluid column reflows at 320 px
  and 200% text. Expanded centers that column at a comfortable reading
  width. Current surface, type, spacing and button tokens apply.
- The prompt and answer use immediate disclosure with visible state and
  focus feedback. No animated flip or timer is needed. The shell respects
  reduced motion. The initial loading, retry and Free preview are the
  existing Games states. The static deck has no loading or empty round
  once open. It works offline while the existing capability is available.
- The existing relationship Premium capability, `games.couple`, applies
  in Cloud and Self-Hosted. Game answers stay spoken, except the locally
  revealed film title. No new network call, provider, permission, storage,
  quota or migration. Relationship microcopy is situational and neutral.
- Acceptance covers opening from Games, presenting a playable prompt,
  revealing or skipping a film, seeing the next format, checking focus,
  cycling, and returning to the initiating control. Use representative
  320/360/390/430 and expanded viewports, Light/Dark, reduced motion and
  200% text. The Web/native wrapper contract is shared.

[Generated Compact reference](compact-rounds-reference.webp) shows the
scrolled shelf, the hidden-answer state and the revealed-answer state.
Generated with built-in OpenAI ImageGen on 2026-11-15 from the two existing
Playwright screenshots of the Games shelf and card in PR #1901. The
[original prompt](compact-rounds-reference.prompt.txt) records the input.
