
# MemoryCreate


## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;AttachmentEntry&gt;](AttachmentEntry.md)
`body` | string
`experienceKind` | [ExperienceKind](ExperienceKind.md)
`experienceQuestionId` | string
`experienceReplyTo` | string
`happenedOn` | Date
`happenedUntil` | Date
`placeId` | string
`placeIds` | Array&lt;string&gt;
`selectedCoverAttachmentId` | string
`tags` | Array&lt;string&gt;
`title` | string

## Example

```typescript
import type { MemoryCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "body": null,
  "experienceKind": null,
  "experienceQuestionId": null,
  "experienceReplyTo": null,
  "happenedOn": null,
  "happenedUntil": null,
  "placeId": null,
  "placeIds": null,
  "selectedCoverAttachmentId": null,
  "tags": null,
  "title": null,
} satisfies MemoryCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


