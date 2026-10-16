
# SharedHeartMomentSummary

A heart moment as it appears in the caller\'s own Story.  Despite the name, this is not shared-only (#1021 superseded M2-D22): a HeartMoment the caller marked ``PRIVATE`` is projected here too, at its ordinary Timeline position, with ``visibility`` reporting its actual domain visibility rather than an assumed ``SHARED``. The type keeps its established name — renaming it would force every generated client (including hand-written Android test fixtures out of #1021\'s scope) to follow along for no behavioral gain; the real contract fix is the ``visibility`` field, not the type name.

## Properties

Name | Type
------------ | -------------
`attachment` | [AttachmentSummary](AttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`emotion` | [HeartEmotion](HeartEmotion.md)
`happenedOn` | Date
`id` | string
`text` | string
`visibility` | [ContentVisibility](ContentVisibility.md)

## Example

```typescript
import type { SharedHeartMomentSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "attachment": null,
  "author": null,
  "capabilities": null,
  "createdAt": null,
  "emotion": null,
  "happenedOn": null,
  "id": null,
  "text": null,
  "visibility": null,
} satisfies SharedHeartMomentSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SharedHeartMomentSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


