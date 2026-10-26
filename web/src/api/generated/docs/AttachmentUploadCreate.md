
# AttachmentUploadCreate


## Properties

Name | Type
------------ | -------------
`expectedMimeType` | string
`expectedSize` | number
`mediaType` | [MediaType](MediaType.md)
`originalName` | string
`photoLocationCandidate` | boolean

## Example

```typescript
import type { AttachmentUploadCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "expectedMimeType": null,
  "expectedSize": null,
  "mediaType": null,
  "originalName": null,
  "photoLocationCandidate": null,
} satisfies AttachmentUploadCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AttachmentUploadCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


