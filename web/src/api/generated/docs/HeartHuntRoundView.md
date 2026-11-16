
# HeartHuntRoundView

One round as the caller may see it.  `heart` is present for the hider and, for the seeker, only after the round is FOUND. The seeker\'s search never receives it earlier.

## Properties

Name | Type
------------ | -------------
`attachmentId` | string
`bestLevel` | number
`createdAt` | Date
`deleteAfter` | Date
`foundAt` | Date
`heart` | [HeartPoint](HeartPoint.md)
`id` | string
`kept` | boolean
`partnerId` | string
`role` | string
`state` | string
`tapCount` | number
`taps` | [Array&lt;HeartPoint&gt;](HeartPoint.md)

## Example

```typescript
import type { HeartHuntRoundView } from ''

// TODO: Update the object below with actual values
const example = {
  "attachmentId": null,
  "bestLevel": null,
  "createdAt": null,
  "deleteAfter": null,
  "foundAt": null,
  "heart": null,
  "id": null,
  "kept": null,
  "partnerId": null,
  "role": null,
  "state": null,
  "tapCount": null,
  "taps": null,
} satisfies HeartHuntRoundView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HeartHuntRoundView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


