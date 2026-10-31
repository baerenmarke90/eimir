
# AttachmentDetail


## Properties

Name | Type
------------ | -------------
`createdAt` | Date
`durationSeconds` | number
`hasThumbnail` | boolean
`height` | number
`id` | string
`isSensitive` | boolean
`mediaType` | [MediaType](MediaType.md)
`mimeType` | string
`size` | number
`status` | string
`version` | number
`width` | number

## Example

```typescript
import type { AttachmentDetail } from ''

// TODO: Update the object below with actual values
const example = {
  "createdAt": null,
  "durationSeconds": null,
  "hasThumbnail": null,
  "height": null,
  "id": null,
  "isSensitive": null,
  "mediaType": null,
  "mimeType": null,
  "size": null,
  "status": null,
  "version": null,
  "width": null,
} satisfies AttachmentDetail

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as AttachmentDetail
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


