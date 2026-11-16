
# PicturePingPongView


## Properties

Name | Type
------------ | -------------
`drawerId` | string
`finishedEarly` | boolean
`id` | string
`maxTurns` | number
`savedMemoryId` | string
`startedBy` | string
`status` | string
`strokes` | [Array&lt;PictureStrokeView&gt;](PictureStrokeView.md)
`turnsDone` | number
`updatedAt` | Date

## Example

```typescript
import type { PicturePingPongView } from ''

// TODO: Update the object below with actual values
const example = {
  "drawerId": null,
  "finishedEarly": null,
  "id": null,
  "maxTurns": null,
  "savedMemoryId": null,
  "startedBy": null,
  "status": null,
  "strokes": null,
  "turnsDone": null,
  "updatedAt": null,
} satisfies PicturePingPongView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PicturePingPongView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


