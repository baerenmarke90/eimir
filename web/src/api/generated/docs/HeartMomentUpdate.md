
# HeartMomentUpdate

Content update payload.  ``visibility`` is intentionally absent: changing visibility is a separate operation with destructive consequences and must not happen as a side effect of a text update.

## Properties

Name | Type
------------ | -------------
`attachmentId` | string
`attachmentIsSensitive` | boolean
`attachments` | [Array&lt;AttachmentEntry&gt;](AttachmentEntry.md)
`audioSpeakerName` | string
`audioTitle` | string
`emotion` | [HeartEmotion](HeartEmotion.md)
`happenedOn` | Date
`selectedCoverAttachmentId` | string
`tags` | Array&lt;string&gt;
`text` | string

## Example

```typescript
import type { HeartMomentUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "attachmentId": null,
  "attachmentIsSensitive": null,
  "attachments": null,
  "audioSpeakerName": null,
  "audioTitle": null,
  "emotion": null,
  "happenedOn": null,
  "selectedCoverAttachmentId": null,
  "tags": null,
  "text": null,
} satisfies HeartMomentUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HeartMomentUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


