
# WhoOfUsRemoteGame


## Properties

Name | Type
------------ | -------------
`agreementCount` | number
`endedBy` | string
`id` | string
`myAnsweredCount` | number
`partnerAnsweredCount` | number
`questions` | [Array&lt;WhoOfUsRemoteQuestion&gt;](WhoOfUsRemoteQuestion.md)
`revealedCount` | number
`startedBy` | string
`status` | [CoupleGameStatus](CoupleGameStatus.md)
`turnAccountId` | string
`updatedAt` | Date

## Example

```typescript
import type { WhoOfUsRemoteGame } from ''

// TODO: Update the object below with actual values
const example = {
  "agreementCount": null,
  "endedBy": null,
  "id": null,
  "myAnsweredCount": null,
  "partnerAnsweredCount": null,
  "questions": null,
  "revealedCount": null,
  "startedBy": null,
  "status": null,
  "turnAccountId": null,
  "updatedAt": null,
} satisfies WhoOfUsRemoteGame

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WhoOfUsRemoteGame
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


