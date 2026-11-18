
# OurMomentsRemoteGame


## Properties

Name | Type
------------ | -------------
`cards` | [Array&lt;OurMomentsCardView&gt;](OurMomentsCardView.md)
`endedBy` | string
`flipsDone` | number
`id` | string
`lastTurn` | [OurMomentsLastTurnView](OurMomentsLastTurnView.md)
`matchedPairs` | number
`scores` | [Array&lt;OurMomentsScore&gt;](OurMomentsScore.md)
`startedBy` | string
`status` | [CoupleGameStatus](CoupleGameStatus.md)
`totalPairs` | number
`turnAccountId` | string
`updatedAt` | Date

## Example

```typescript
import type { OurMomentsRemoteGame } from ''

// TODO: Update the object below with actual values
const example = {
  "cards": null,
  "endedBy": null,
  "flipsDone": null,
  "id": null,
  "lastTurn": null,
  "matchedPairs": null,
  "scores": null,
  "startedBy": null,
  "status": null,
  "totalPairs": null,
  "turnAccountId": null,
  "updatedAt": null,
} satisfies OurMomentsRemoteGame

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OurMomentsRemoteGame
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


