
# WaitingGameView

One game that waits on the reader; it names the game and the ask only.

## Properties

Name | Type
------------ | -------------
`game` | [WaitingGameKind](WaitingGameKind.md)
`reason` | [WaitingGameReason](WaitingGameReason.md)
`since` | Date

## Example

```typescript
import type { WaitingGameView } from ''

// TODO: Update the object below with actual values
const example = {
  "game": null,
  "reason": null,
  "since": null,
} satisfies WaitingGameView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WaitingGameView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


