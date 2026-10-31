# Our questions — editorial catalog v1

Owner: [issue #444](https://github.com/baerenmarke90/eimir/issues/444)  
Date: 2026-10-31  
Catalog version: `1.0.0`  
Status: complete editorial proposal, ready for review; no runtime integration.

[editorial-catalog-v1.json](editorial-catalog-v1.json) is the authoritative source. This document is its generated reading copy. Update both together; do not treat the tables as a separate catalog.

## Scope and commercial boundary

The catalog contains **180 semantic questions and 360 localized texts**: 60 Free/Core daily prompts and six Premium packs of 20. Pro is Space-scoped, so one entitlement serves both partners. This preserves the existing Mixed “Daily Questions & Shared Answers” classification in [the feature matrix](../../FREEMIUM-FEATURE-MATRIX.md). Core questions remain useful and varied; Premium adds deliberate topic selection and additional rounds.

The labels in this editorial file are not an entitlement implementation. Runtime integration, assignment selection, protected answers, reveal, history, exports and the proposed `question.curated_packs` capability remain owned by #444. Annual reflection remains #516.

| Collection ID | German product label | Classification | Questions |
| --- | --- | --- | ---: |
| `daily_core` | Die tägliche Frage | FREE_CORE | 60 |
| `small_things` | Kleine Dinge, die zählen | PREMIUM | 20 |
| `remember_when` | Weißt du noch? | PREMIUM | 20 |
| `everyday_together` | Wir im Alltag | PREMIUM | 20 |
| `wishes_future` | Wünsche & Zukunft | PREMIUM | 20 |
| `what_connects_us` | Was uns verbindet | PREMIUM | 20 |
| `playful_surprising` | Spielerisch & überraschend | PREMIUM | 20 |

## Content and versioning contract

- Every question has a stable semantic key and content version 1. The abbreviated IDs below all carry the JSON prefix `our_questions.`.
- German and English are authored localized prompt texts, not translations of a person's answers. Neither language is a fallback placeholder.
- Categories describe subject matter. The `light`, `reflective` and `deep` labels guide explicit topic/depth choice and do not assess the couple.
- The daily core spans six categories of ten questions. The more personal pack contains optional deeper prompts; no question is compulsory.
- A wording revision must preserve earlier assigned versions. A substantive change in meaning requires a new stable key.
- Newly written editorial content; no predecessor question seed, commercial deck, therapy questionnaire, unattributed web list or private user content was consulted or imported.
- Original AI-assisted German writing and authored English translations, followed by a wording and near-duplicate review on 2026-10-31. No separate license grant; the repository's licensing/contribution rules apply.

## Validation

One-off structural checks cover exact counts, unique IDs and normalized prompts in both languages, complete locale pairs, collection/category/depth references, version/active fields, bounded non-empty text and absence of placeholder markup. Candidate word-overlap pairs were reviewed editorially; different intent was retained and unnecessarily similar prompts were replaced.

These checks validate this content delivery. They do not claim runtime tests, installed question screens, clinical validation or Product Owner approval.

## The daily question

German product label: **Die tägliche Frage**  
A little question for your everyday connection.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `core.001` | light | Was war heute ein kleiner guter Moment für dich? | What was one small good moment in your day? |
| `core.002` | light | Zu welcher Tageszeit freust du dich besonders über eine kurze Nachricht von mir? | At what time of day do you especially enjoy a quick message from me? |
| `core.003` | light | Welchen Snack würdest du gerade gern mit mir teilen? | What snack would you like to share with me right now? |
| `core.004` | light | Was hat dich zuletzt zum Lachen gebracht? | What made you laugh recently? |
| `core.005` | light | Wie würde ein gemütlicher Abend für dich heute aussehen? | What would a cosy evening look like for you today? |
| `core.006` | light | Wofür würdest du dir heute gern fünf Minuten nur für dich nehmen? | What would you like to spend five minutes doing just for yourself today? |
| `core.007` | light | Wo machst du im Alltag am liebsten eine kleine Pause? | Where do you most like to take a short break during the day? |
| `core.008` | light | Was hilft dir nach einem vollen Tag beim Abschalten? | What helps you unwind after a busy day? |
| `core.009` | light | An welchem Wochentag würde uns eine kleine gemeinsame Pause guttun? | On which day of the week would a little break together do us good? |
| `core.010` | light | Welchem Hobby würdest du gerade gern etwas mehr Zeit geben? | Which hobby would you like to make a little more time for right now? |
| `core.011` | light | Welche Eigenschaft magst du gerade besonders an mir? | What quality do you especially like about me right now? |
| `core.012` | light | Welches nette Wort ist dir in letzter Zeit im Kopf geblieben? | What kind word has stayed with you recently? |
| `core.013` | light | Über welche kleine Aufmerksamkeit freust du dich immer? | What small thoughtful gesture always makes you happy? |
| `core.014` | light | Welche meiner Eigenarten fühlt sich für dich inzwischen vertraut an? | Which of my little quirks now feels familiar to you? |
| `core.015` | light | Wofür möchtest du mir heute Danke sagen? | What would you like to thank me for today? |
| `core.016` | light | Was an mir bringt dich oft zum Lächeln? | What about me often makes you smile? |
| `core.017` | reflective | Welche meiner Fähigkeiten unterschätze ich deiner Meinung nach? | Which of my abilities do you think I underestimate? |
| `core.018` | light | Womit kann ich dich meist gut aufmuntern? | What can I usually do to cheer you up? |
| `core.019` | light | Mit welchen drei Worten würdest du unser letztes Treffen beschreiben? | What three words would you use to describe the last time we spent together? |
| `core.020` | light | Welche ganz gewöhnliche Sache macht mit mir mehr Spaß? | What completely ordinary thing is more fun with me? |
| `core.021` | light | Woran erinnerst du dich bei unserem ersten gemeinsamen Essen? | What do you remember about our first meal together? |
| `core.022` | light | Welcher Ort erinnert dich sofort an uns? | What place instantly reminds you of us? |
| `core.023` | light | Welches Foto von uns würdest du gerade gern wieder ansehen? | Which photo of us would you like to look at again right now? |
| `core.024` | light | Welcher Geruch weckt bei dir eine gemeinsame Erinnerung? | What smell brings back a memory of something we shared? |
| `core.025` | light | Welches Essen verbindest du mit einer schönen Zeit mit mir? | What food reminds you of a lovely time with me? |
| `core.026` | light | Welche Nachricht von mir hast du gern noch einmal gelesen? | Which message from me did you enjoy reading again? |
| `core.027` | light | Was haben wir trotz schlechten Wetters richtig genossen? | What did we really enjoy despite bad weather? |
| `core.028` | light | Welches Lied erinnert dich an eines unserer Treffen? | Which song reminds you of a time we spent together? |
| `core.029` | light | Welche kleine Überraschung von uns ist dir in Erinnerung geblieben? | What little surprise between us has stayed in your memory? |
| `core.030` | light | Welche kleine Gewohnheit ist mit der Zeit zwischen uns entstanden? | What little habit has developed between us over time? |
| `core.031` | light | Was würdest du mit einer unerwartet freien Stunde mit mir anfangen? | What would you do with an unexpected free hour with me? |
| `core.032` | light | Wo würdest du gern einmal mit mir spazieren gehen? | Where would you like to go for a walk with me? |
| `core.033` | light | Welche Eissorte würdest du für unseren nächsten Spaziergang auswählen? | What ice cream flavour would you choose for our next walk together? |
| `core.034` | light | Was würdest du bei unserem nächsten Treffen gern gemeinsam kochen oder bestellen? | What would you like us to cook or order the next time we meet? |
| `core.035` | light | Welche Ausstellung, Veranstaltung oder Aufführung macht dich gerade neugierig? | What exhibition, event or performance are you curious about right now? |
| `core.036` | light | Welchen Film oder welche Serie würdest du mir gern zeigen? | What film or series would you like to show me? |
| `core.037` | light | Welche schöne Unternehmung fällt dir ein, die fast nichts kostet? | What lovely thing could we do that costs almost nothing? |
| `core.038` | light | Was möchtest du diesen Monat gern mit mir erleben? | What would you like to experience with me this month? |
| `core.039` | light | Was wäre dein Vorschlag für einen verregneten Tag mit mir? | What would you suggest for a rainy day with me? |
| `core.040` | light | Welche Kleinigkeit sollten wir bei unserem nächsten Treffen unbedingt dabeihaben? | What little thing should we make sure to bring the next time we meet? |
| `core.041` | light | Welches Tier würde am besten zu uns als Team passen? | What animal would best represent us as a team? |
| `core.042` | light | Welches Emoji passt heute zu dir? | Which emoji suits you today? |
| `core.043` | light | Welchen erfundenen Ort würdest du gern mit mir besuchen? | What fictional place would you like to visit with me? |
| `core.044` | light | Welche Superkraft wäre bei einem Ausflug mit uns besonders praktisch? | What superpower would be especially useful on an outing together? |
| `core.045` | light | Welches Geräusch könnte unser Erkennungszeichen sein? | What sound could be our signature sound? |
| `core.046` | light | Wie würde ein Film über unseren heutigen Tag heißen? | What would a film about our day today be called? |
| `core.047` | light | Welche völlig unnötige Erfindung würden wir vermutlich trotzdem benutzen? | What completely unnecessary invention would we probably use anyway? |
| `core.048` | light | Bei welcher harmlosen Spaß-Challenge würdest du gegen mich antreten? | What silly, harmless challenge would you take me on at? |
| `core.049` | light | Welche neue Regel würdest du für unser nächstes Dessert erfinden? | What new rule would you invent for our next dessert? |
| `core.050` | light | Wenn unser nächstes Treffen eine geheime Mission wäre: Was wäre der Auftrag? | If our next time together were a secret mission, what would the objective be? |
| `core.051` | light | Wie magst du zwischendurch am liebsten mit mir in Kontakt sein? | How do you most like to stay in touch with me during the day? |
| `core.052` | reflective | Woran merkst du, dass ich dir wirklich zuhöre? | How can you tell that I am really listening to you? |
| `core.053` | light | Welche Art von Begrüßung magst du bei uns besonders? | What do you especially like about the way we greet each other? |
| `core.054` | light | Was macht einen Abschied für dich ein bisschen schöner? | What makes saying goodbye a little nicer for you? |
| `core.055` | light | Über welches Thema könntest du gerade lange mit mir reden? | What topic could you talk to me about for ages right now? |
| `core.056` | light | Worauf bist du gerade ein kleines bisschen stolz? | What are you feeling a little proud of right now? |
| `core.057` | light | Worauf freust du dich in dieser Woche? | What are you looking forward to this week? |
| `core.058` | light | Was würdest du heute gern anders machen als gestern? | What would you like to do differently today than yesterday? |
| `core.059` | reflective | Wie kann ich dir einen Tag mit wenig Energie etwas leichter machen? | How could I make a low-energy day a little easier for you? |
| `core.060` | light | Welche Frage würdest du mir heute selbst gern stellen? | What question would you like to ask me today? |

## The little things that matter

German product label: **Kleine Dinge, die zählen**  
Discover which small gestures mean something to you.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `small_things.001` | light | Welche kleine Geste von mir hat dir zuletzt gutgetan? | What small gesture of mine made you feel good recently? |
| `small_things.002` | light | Was würde einen gewöhnlichen Dienstag für uns schöner machen? | What would make an ordinary Tuesday nicer for us? |
| `small_things.003` | reflective | Welche Mühe von mir bemerkst du, auch wenn ich nicht darüber spreche? | What effort do you notice me making, even when I do not mention it? |
| `small_things.004` | reflective | Welches Kompliment über dich würde dir gerade besonders viel bedeuten? | What compliment about you would mean a lot to you right now? |
| `small_things.005` | light | Welche Kleinigkeit aus meiner Welt hast du durch mich liebgewonnen? | What little part of my world have you grown fond of through me? |
| `small_things.006` | reflective | Wobei möchtest du dich von mir wertgeschätzt fühlen, ohne dafür etwas leisten zu müssen? | When would you like to feel valued by me without having to achieve anything? |
| `small_things.007` | light | Wodurch fühlst du dich willkommen, wenn wir uns sehen? | What makes you feel welcome when we see each other? |
| `small_things.008` | reflective | Welche nette Beobachtung über mich behältst du meistens für dich? | What kind observation about me do you usually keep to yourself? |
| `small_things.009` | light | Wie würdest du gern eine kleine gute Nachricht mit mir feiern? | How would you like to celebrate a little piece of good news with me? |
| `small_things.010` | reflective | Wie kann ich dir an einem vollen Tag zeigen, dass ich an dich denke, ohne deine Aufmerksamkeit zu beanspruchen? | How could I show that I am thinking of you on a busy day without asking for your attention? |
| `small_things.011` | light | Was könnte ich dir dalassen, damit du dich auch ohne mich ein bisschen begleitet fühlst? | What could I leave for you to help you feel a little company when I am not there? |
| `small_things.012` | reflective | Welche Art von Hilfe kannst du leichter annehmen, wenn ich sie dir ganz konkret anbiete? | What kind of help is easier for you to accept when I offer something specific? |
| `small_things.013` | light | Welcher unscheinbare Gegenstand hat durch uns für dich eine besondere Bedeutung bekommen? | What ordinary object has become meaningful to you because of us? |
| `small_things.014` | light | Welches winzige Ritual würdest du gern bei unseren Treffen einführen? | What tiny ritual would you like to introduce when we meet? |
| `small_things.015` | reflective | Bei welcher unspektakulären Sache funktionieren wir für dich besonders gut zusammen? | What unremarkable thing do you feel we do especially well together? |
| `small_things.016` | reflective | Welche aufmerksame Geste hast du durch mich selbst übernommen? | What thoughtful gesture have you picked up from me? |
| `small_things.017` | light | Welche schöne Kleinigkeit hast du heute bemerkt, die du mir zeigen möchtest? | What lovely little thing did you notice today that you would like to show me? |
| `small_things.018` | reflective | Welche Form von Wertschätzung magst du lieber unter vier Augen als vor anderen? | What kind of appreciation do you prefer in private rather than in front of other people? |
| `small_things.019` | reflective | Wo machen wir aus einer netten Idee manchmal mehr Aufwand, als eigentlich nötig wäre? | When do we sometimes turn a thoughtful idea into more work than it needs to be? |
| `small_things.020` | reflective | Was bedeutet für dich Zuwendung an einem Tag, an dem du nichts erzählen möchtest? | What does affection mean to you on a day when you do not feel like talking? |

## Remember when?

German product label: **Weißt du noch?**  
Look back on the experiences that make up your story.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `remember_when.001` | light | Bei welchem gemeinsamen Moment musst du heute noch grinsen? | Which moment together still makes you grin? |
| `remember_when.002` | light | Welchen Tag mit mir würdest du gern noch einmal erleben? | Which day with me would you like to live again? |
| `remember_when.003` | reflective | Welches Erlebnis hat deinen Blick auf mich verändert? | What experience changed the way you saw me? |
| `remember_when.004` | light | Welches kleine Detail unseres Kennenlernens ist dir besonders klar in Erinnerung? | What small detail from getting to know each other do you remember especially clearly? |
| `remember_when.005` | light | Welche gemeinsame Panne ist im Rückblick eine gute Geschichte geworden? | What mishap together has turned into a good story? |
| `remember_when.006` | reflective | Welches ungeplante Gespräch ist dir besonders wichtig geworden? | What unplanned conversation has become especially important to you? |
| `remember_when.007` | light | Was habe ich am Anfang vermutlich gar nicht bemerkt, das dir schon aufgefallen war? | What had you already noticed early on that I probably had not noticed at all? |
| `remember_when.008` | reflective | Wann haben wir gemeinsam etwas gewagt, worüber du heute froh bist? | When did we take a chance together that you are glad we took? |
| `remember_when.009` | reflective | Welche gemeinsame Erinnerung bekommt deiner Meinung nach zu wenig Aufmerksamkeit? | Which shared memory do you think deserves more attention? |
| `remember_when.010` | reflective | Was würde dein damaliges Ich an uns heute am meisten überraschen? | What about us today would most surprise your past self? |
| `remember_when.011` | light | Welche Umleitung oder Planänderung hat uns unerwartet etwas Schönes beschert? | What detour or change of plan unexpectedly led to something lovely? |
| `remember_when.012` | light | Was habe ich dir einmal gezeigt, das seitdem zu deinem Leben gehört? | What did I once introduce you to that has been part of your life ever since? |
| `remember_when.013` | reflective | An welchem Erlebnis merkst du, dass wir inzwischen vertrauter miteinander sind? | What experience shows you how much more at ease we have become with each other? |
| `remember_when.014` | reflective | Wann war gemeinsames Schweigen für dich besonders schön? | When did you especially enjoy being quiet together? |
| `remember_when.015` | light | Welches Wort oder welcher Satz hat durch ein Erlebnis mit uns eine eigene Bedeutung bekommen? | What word or phrase has taken on its own meaning because of something we experienced? |
| `remember_when.016` | light | Von welchem unauffälligen gemeinsamen Moment hättest du gern ein Foto? | What unremarkable moment together do you wish you had a photo of? |
| `remember_when.017` | light | Was würdest du in eine kleine Erinnerungskiste für unsere erste gemeinsame Zeit legen? | What would you put in a little memory box for our early days together? |
| `remember_when.018` | reflective | Welchen Moment habe ich vielleicht längst vergessen, obwohl er dir viel bedeutet? | What moment might I have forgotten even though it means a lot to you? |
| `remember_when.019` | reflective | Was hat sich an einer gemeinsamen Tradition verändert, seit sie entstanden ist? | How has one of our traditions changed since it began? |
| `remember_when.020` | reflective | Welches Kapitel unserer bisherigen Geschichte würdest du gern einmal aus meiner Sicht hören? | Which chapter of our story so far would you like to hear from my point of view? |

## Our everyday life

German product label: **Wir im Alltag**  
Find out what makes everyday life together easier for you.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `everyday_together.001` | reflective | Wobei könnten wir es uns gegenseitig gerade leichter machen? | What could we make easier for each other right now? |
| `everyday_together.002` | light | Welche gemeinsame Gewohnheit möchtest du behalten? | Which habit of ours would you like to keep? |
| `everyday_together.003` | reflective | Bei welcher wiederkehrenden Verabredung würde uns eine klare Absprache mehr helfen als spontanes Improvisieren? | For which recurring arrangement would a clear agreement help us more than improvising? |
| `everyday_together.004` | reflective | Welche kleine Entscheidung möchtest du nicht jedes Mal allein für uns treffen müssen? | What small decision would you rather not always have to make for both of us? |
| `everyday_together.005` | reflective | Wie möchtest du mir sagen können, dass du Zeit für dich brauchst? | How would you like to be able to tell me that you need time to yourself? |
| `everyday_together.006` | reflective | Wie könnten wir unsere gemeinsame Zeit planen, ohne jede freie Minute zu verplanen? | How could we plan time together without filling every free minute? |
| `everyday_together.007` | reflective | Welche Absprache würde helfen, wenn wir bei einem Treffen unterschiedlich viel Energie haben? | What agreement would help when we have different energy levels during time together? |
| `everyday_together.008` | reflective | Welche Erwartung an gemeinsame Pünktlichkeit sollten wir einmal ausdrücklich besprechen? | What expectation about being on time for each other should we discuss explicitly? |
| `everyday_together.009` | reflective | Welche Absprache zum Handy würde unsere gemeinsame Aufmerksamkeit verbessern? | What agreement about phones would help us give each other more attention? |
| `everyday_together.010` | reflective | Wie können wir bei einer Einladung herausfinden, ob sie für uns beide gerade passt? | How could we work out whether an invitation suits both of us right now? |
| `everyday_together.011` | reflective | Was würde es dir leichter machen, eine Verabredung mit mir abzusagen? | What would make it easier for you to cancel plans with me? |
| `everyday_together.012` | reflective | Woran würdest du gern früher merken lassen, dass dir eine Aufgabe zu viel wird? | How would you like to signal earlier that a task is becoming too much for you? |
| `everyday_together.013` | reflective | Welche Art von kurzer Abstimmung würde uns vor einem vollen Wochenende helfen? | What kind of quick check-in would help us before a busy weekend? |
| `everyday_together.014` | reflective | Wie kann ich erkennen, dass du gerade keinen Lösungsvorschlag von mir möchtest? | How can I tell that you do not want me to suggest a solution right now? |
| `everyday_together.015` | reflective | Welche Information über meine nächsten Tage würde dir das Mitplanen erleichtern? | What information about my next few days would make planning together easier for you? |
| `everyday_together.016` | reflective | Wie könnten wir bei gemeinsamen Ausgaben beide entspannt Nein sagen können? | How could we make it comfortable for either of us to say no to a shared expense? |
| `everyday_together.017` | reflective | Woran erkennen wir, dass aus einer freiwilligen Hilfe unbemerkt eine feste Erwartung geworden ist? | How could we notice when a voluntary favour has quietly become an expectation? |
| `everyday_together.018` | reflective | Welche gemeinsame Verpflichtung würden wir heute vielleicht nicht noch einmal eingehen? | What shared commitment might we choose not to take on again today? |
| `everyday_together.019` | reflective | Was würde dir helfen, nach einer kleinen Gereiztheit wieder unbefangen mit mir umzugehen? | What would help you feel at ease with me again after a small irritation? |
| `everyday_together.020` | reflective | Welche gute Absprache sollten wir noch einmal prüfen, weil unser Alltag inzwischen anders aussieht? | What useful agreement should we revisit because our everyday lives have changed? |

## Wishes and the future

German product label: **Wünsche & Zukunft**  
Make room for shared ideas and personal wishes.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `wishes_future.001` | light | Was würdest du gern mit mir zum ersten Mal ausprobieren? | What would you like to try with me for the first time? |
| `wishes_future.002` | light | Wie sähe ein Wochenende aus, das genau zu uns passt? | What would a weekend that really suits us look like? |
| `wishes_future.003` | reflective | Welche Idee für uns reizt dich, obwohl sie gar nicht nach unseren bisherigen Plänen klingt? | What idea for us appeals to you even though it is nothing like our plans so far? |
| `wishes_future.004` | light | Was würdest du mit mir gern einfach ausprobieren, ohne darin gut werden zu müssen? | What would you like to try with me without having to get good at it? |
| `wishes_future.005` | reflective | Wofür soll in unserem Leben in einem Jahr mehr Platz sein? | What would you like there to be more room for in our lives a year from now? |
| `wishes_future.006` | reflective | Wie soll sich unsere nächste gemeinsame Reise für dich anfühlen? | How would you like our next trip together to feel? |
| `wishes_future.007` | reflective | Bei welchem persönlichen Wunsch wünschst du dir meine Begleitung, ohne dass er unser gemeinsames Ziel werden muss? | Which personal wish would you like my support with without it having to become a shared goal? |
| `wishes_future.008` | reflective | Mit welchem kleinen Schritt könnten wir einer großen gemeinsamen Idee näherkommen? | What small step could bring us closer to a big idea we share? |
| `wishes_future.009` | reflective | Was soll zwischen uns verlässlich bleiben, wenn sich um uns herum viel verändert? | What would you like to be able to rely on between us when a lot around us changes? |
| `wishes_future.010` | reflective | Für welche mögliche Zukunftsentscheidung möchtest du dir bewusst viel Bedenkzeit lassen? | What possible future decision would you deliberately like plenty of time to think about? |
| `wishes_future.011` | reflective | Woran würdest du bei unterschiedlichen Wünschen einen guten Kompromiss erkennen? | How would you recognise a good compromise when we want different things? |
| `wishes_future.012` | light | Wie könnten wir uns die Vorfreude auf etwas Gemeinsames im Alltag sichtbarer machen? | How could we make anticipation of something together more visible in everyday life? |
| `wishes_future.013` | reflective | Bei welcher neuen Erfahrung würdest du mich gern einmal außerhalb meiner gewohnten Rolle erleben? | What new experience would you like to share that would let you see me outside my usual role? |
| `wishes_future.014` | reflective | Welche Freiheit ist dir auch in einer gemeinsamen Zukunft besonders wichtig? | What freedom is especially important to you in a future together? |
| `wishes_future.015` | reflective | Welchen gemeinsamen Plan dürfen wir ohne schlechtes Gewissen noch eine Weile liegen lassen? | What shared plan could we put aside for a while without feeling guilty? |
| `wishes_future.016` | reflective | Wie möchtest du mir sagen können, dass sich eine frühere Zukunftsvorstellung von dir verändert hat? | How would you like to be able to tell me that your idea of the future has changed? |
| `wishes_future.017` | light | An welchem Ort würdest du mit mir gern länger bleiben, statt nur kurz vorbeizuschauen? | Where would you like to stay with me for longer rather than just visit briefly? |
| `wishes_future.018` | reflective | Was möchtest du auch in vielen Jahren noch neugierig mit mir entdecken? | What would you like to keep exploring with me many years from now? |
| `wishes_future.019` | reflective | Welcher gemeinsame Traum hängt für dich vor allem von Mut und weniger von Geld ab? | What dream together depends more on courage than on money for you? |
| `wishes_future.020` | reflective | Welchen Teil unserer Zukunft möchtest du gern offenlassen, statt ihn jetzt schon festzulegen? | What part of our future would you like to leave open rather than decide now? |

## What connects us

German product label: **Was uns verbindet**  
Take time for more personal thoughts about closeness, trust and independence.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `what_connects_us.001` | reflective | Wann fühlst du dich mir besonders nah? | When do you feel especially close to me? |
| `what_connects_us.002` | reflective | Was möchtest du mir öfter sagen, vergisst es aber im Alltag? | What would you like to tell me more often but forget in everyday life? |
| `what_connects_us.003` | deep | Welche Seite von dir kannst du bei mir zeigen, die anderswo wenig Platz hat? | What side of yourself can you show with me that gets little space elsewhere? |
| `what_connects_us.004` | reflective | Wie kann ich dir zeigen, dass auch ein „Ich weiß es noch nicht“ eine gute Antwort sein darf? | How can I show you that “I do not know yet” can be a perfectly good answer? |
| `what_connects_us.005` | deep | Was möchtest du mit mir teilen können, ohne es zuerst ordentlich erklären zu müssen? | What would you like to be able to share with me without having to explain it neatly first? |
| `what_connects_us.006` | deep | Was an dir wird von anderen leicht missverstanden und soll bei uns besser verstanden sein? | What do other people easily misunderstand about you that you would like us to understand better? |
| `what_connects_us.007` | deep | Welchem persönlichen Wert möchtest du auch dann treu bleiben, wenn wir unterschiedlich darüber denken? | What personal value would you want to stay true to even when we think differently about it? |
| `what_connects_us.008` | reflective | Wobei brauchst du von mir eher Ermutigung als Zustimmung? | When do you need encouragement from me rather than agreement? |
| `what_connects_us.009` | deep | Was fällt dir an Zuneigung manchmal schwer anzunehmen, obwohl du sie dir wünschst? | What kind of affection is sometimes hard for you to accept even though you want it? |
| `what_connects_us.010` | reflective | Was hilft dir, in einem Gespräch mit mir deine Meinung ändern zu dürfen? | What helps you feel free to change your mind in a conversation with me? |
| `what_connects_us.011` | deep | Welche persönliche Grenze möchtest du mir verständlicher machen? | What personal boundary would you like to help me understand better? |
| `what_connects_us.012` | deep | Was unterscheidet für dich Nähe von ständiger Verfügbarkeit? | What is the difference for you between closeness and being constantly available? |
| `what_connects_us.013` | reflective | Wie möchtest du Zuneigung zeigen dürfen, wenn dir gerade nicht nach großen Worten ist? | How would you like to be able to show affection when you do not feel like using big words? |
| `what_connects_us.014` | deep | Bei welchem Unterschied zwischen uns möchtest du dich ernst genommen fühlen, ohne ihn auflösen zu müssen? | What difference between us would you like to have taken seriously without having to resolve it? |
| `what_connects_us.015` | reflective | Welche kleine Verlässlichkeit ist für dein Vertrauen besonders wichtig? | What small thing you can count on is especially important to your trust? |
| `what_connects_us.016` | deep | Was soll zwischen uns bleiben, auch wenn wir mit vertrauten Menschen über unsere Beziehung sprechen? | What would you like us to keep between ourselves even when we talk about our relationship with people we trust? |
| `what_connects_us.017` | reflective | Bei welchen Fragen brauchst du mehr Zeit für eine Antwort, als es von außen vielleicht wirkt? | What kinds of questions do you need more time to answer than it might seem from the outside? |
| `what_connects_us.018` | deep | Welche Vorstellung von Liebe hat sich für dich im Lauf der Zeit verändert? | What idea about love has changed for you over time? |
| `what_connects_us.019` | deep | Welchen Wunsch an unser Miteinander kannst du schriftlich leichter ausdrücken als im Gespräch? | What wish for the way we relate to each other is easier for you to express in writing than out loud? |
| `what_connects_us.020` | deep | Was hat dir unsere Beziehung über dich selbst gezeigt, das du vorher nicht so klar gesehen hast? | What has our relationship shown you about yourself that you had not seen as clearly before? |

## Playful surprises

German product label: **Spielerisch & überraschend**  
Enjoy unusual ideas and little flights of imagination.

| ID | Depth | German (de) | English (en) |
| --- | --- | --- | --- |
| `playful_surprising.001` | light | Welcher Song wäre heute unser gemeinsamer Soundtrack? | What song would be our shared soundtrack today? |
| `playful_surprising.002` | light | Wenn wir morgen einen Tag lang alles tauschen: Worauf freust du dich? | If we swapped lives for a day tomorrow, what would you look forward to? |
| `playful_surprising.003` | light | Welcher Alltagsgegenstand müsste in ein Museum über uns? | What everyday object would belong in a museum about us? |
| `playful_surprising.004` | light | Welchen völlig neuen Feiertag würden wir gemeinsam erfinden? | What completely new holiday would we invent together? |
| `playful_surprising.005` | light | Was würden wir aus unserem eigenen kleinen Foodtruck verkaufen? | What would we sell from our own little food truck? |
| `playful_surprising.006` | light | Welche lustige Regel sollte auf einer Insel gelten, die nur uns gehört? | What funny rule would apply on an island that belonged only to us? |
| `playful_surprising.007` | light | Was würden wir als Erstes tun, wenn wir für zwanzig Minuten winzig klein wären? | What would we do first if we were tiny for twenty minutes? |
| `playful_surprising.008` | light | Mit welchem ehrlichen Werbespruch würdest du einen Ausflug mit uns ankündigen? | What honest advertising slogan would you use for an outing with us? |
| `playful_surprising.009` | light | Welchen ungewöhnlichen Beruf könnten wir als Duo ausprobieren? | What unusual job could we try as a duo? |
| `playful_surprising.010` | light | Welche Macke müsste ein kleines Roboter-Maskottchen von uns unbedingt haben? | What quirk would a little robot mascot of us absolutely need? |
| `playful_surprising.011` | light | Welche Alltagssache würden wir unnötig feierlich eröffnen, wenn uns gerade danach wäre? | What everyday thing would we give an unnecessarily grand opening if we felt like it? |
| `playful_surprising.012` | light | Welchen Gegenstand würden wir unserem zukünftigen Ich als rätselhaftes Paket schicken? | What object would we send our future selves in a mysterious parcel? |
| `playful_surprising.013` | light | Wohin würdest du uns für ein zweistündiges Treffen teleportieren? | Where would you teleport us for two hours together? |
| `playful_surprising.014` | light | Welche kleine Show würden wir ohne Vorbereitung zusammen auf eine Bühne bringen? | What little show would we put on together with no preparation? |
| `playful_surprising.015` | light | Welches Filmgenre würde aus einem ganz gewöhnlichen Einkauf mit uns werden? | What film genre would an ordinary shopping trip with us turn into? |
| `playful_surprising.016` | light | Welche Disziplin würden wir für unsere eigenen albernen Olympischen Spiele erfinden? | What event would we invent for our own silly Olympic Games? |
| `playful_surprising.017` | light | Wie würde ein Buchladen heißen, in dem nur Bücher stehen, die uns neugierig machen? | What would we call a bookshop filled only with books that spark our curiosity? |
| `playful_surprising.018` | light | Welche neue Farbe würden wir nach einem Gefühl benennen, das wir miteinander verbinden? | What new colour would we name after a feeling we associate with each other? |
| `playful_surprising.019` | light | Welche kleine Entdeckungstour würden wir starten, wenn wir nur links abbiegen dürften? | What little adventure would we go on if we were only allowed to turn left? |
| `playful_surprising.020` | light | Was würden unsere Schuhe über uns erzählen, wenn man sie interviewen könnte? | What would our shoes say about us if someone could interview them? |

