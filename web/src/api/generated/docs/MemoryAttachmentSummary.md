
# MemoryAttachmentSummary

A bound attachment plus its position in the memory gallery.

## Properties

Name | Type
------------ | -------------
`hasThumbnail` | boolean
`height` | number
`id` | string
`mediaType` | [MediaType](MediaType.md)
`mimeType` | string
`position` | number
`size` | number
`status` | string
`width` | number

## Example

```typescript
import type { MemoryAttachmentSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "hasThumbnail": null,
  "height": null,
  "id": null,
  "mediaType": null,
  "mimeType": null,
  "position": null,
  "size": null,
  "status": null,
  "width": null,
} satisfies MemoryAttachmentSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MemoryAttachmentSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


