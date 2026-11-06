
# HeartMomentCreate


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
`location` | [HeartMomentLocation](HeartMomentLocation.md)
`placeId` | string
`selectedCoverAttachmentId` | string
`tags` | Array&lt;string&gt;
`text` | string
`visibility` | [ContentVisibility](ContentVisibility.md)

## Example

```typescript
import type { HeartMomentCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "attachmentId": null,
  "attachmentIsSensitive": null,
  "attachments": null,
  "audioSpeakerName": null,
  "audioTitle": null,
  "emotion": null,
  "happenedOn": null,
  "location": null,
  "placeId": null,
  "selectedCoverAttachmentId": null,
  "tags": null,
  "text": null,
  "visibility": null,
} satisfies HeartMomentCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HeartMomentCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


