
# WishDetectiveRemoteGame


## Properties

Name | Type
------------ | -------------
`current` | [WishDetectiveCurrentRound](WishDetectiveCurrentRound.md)
`endedBy` | string
`id` | string
`revealed` | [Array&lt;WishDetectiveRevealedRound&gt;](WishDetectiveRevealedRound.md)
`roundsPlayed` | number
`roundsTotal` | number
`scores` | [Array&lt;WishDetectiveScore&gt;](WishDetectiveScore.md)
`startedBy` | string
`status` | [CoupleGameStatus](CoupleGameStatus.md)
`turnAccountId` | string
`updatedAt` | Date

## Example

```typescript
import type { WishDetectiveRemoteGame } from ''

// TODO: Update the object below with actual values
const example = {
  "current": null,
  "endedBy": null,
  "id": null,
  "revealed": null,
  "roundsPlayed": null,
  "roundsTotal": null,
  "scores": null,
  "startedBy": null,
  "status": null,
  "turnAccountId": null,
  "updatedAt": null,
} satisfies WishDetectiveRemoteGame

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishDetectiveRemoteGame
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


