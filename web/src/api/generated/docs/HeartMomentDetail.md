
# HeartMomentDetail


## Properties

Name | Type
------------ | -------------
`attachment` | [AttachmentSummary](AttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`authorId` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`emotion` | [HeartEmotion](HeartEmotion.md)
`happenedOn` | Date
`id` | string
`spaceId` | string
`tags` | Array&lt;string&gt;
`text` | string
`updatedAt` | Date
`version` | number
`visibility` | [ContentVisibility](ContentVisibility.md)

## Example

```typescript
import type { HeartMomentDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "attachment": null,
  "author": null,
  "authorId": null,
  "capabilities": null,
  "createdAt": null,
  "emotion": null,
  "happenedOn": null,
  "id": null,
  "spaceId": null,
  "tags": null,
  "text": null,
  "updatedAt": null,
  "version": null,
  "visibility": null,
} satisfies HeartMomentDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HeartMomentDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


