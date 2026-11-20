
# OurMomentsLastTurnView

The two cards of the latest completed turn, so the partner can see it.

## Properties

Name | Type
------------ | -------------
`cards` | [Array&lt;OurMomentsCardView&gt;](OurMomentsCardView.md)
`matched` | boolean
`playerId` | string

## Example

```typescript
import type { OurMomentsLastTurnView } from ''

// TODO: Update the object below with actual values
const example = {
  "cards": null,
  "matched": null,
  "playerId": null,
} satisfies OurMomentsLastTurnView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OurMomentsLastTurnView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


