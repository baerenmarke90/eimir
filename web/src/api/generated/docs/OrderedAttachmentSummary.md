
# OrderedAttachmentSummary

A bound photo with its stable position in a parent\'s gallery.

## Properties

Name | Type
------------ | -------------
`hasThumbnail` | boolean
`height` | number
`id` | string
`isSensitive` | boolean
`mediaType` | [MediaType](MediaType.md)
`mimeType` | string
`position` | number
`size` | number
`status` | string
`width` | number

## Example

```typescript
import type { OrderedAttachmentSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "hasThumbnail": null,
  "height": null,
  "id": null,
  "isSensitive": null,
  "mediaType": null,
  "mimeType": null,
  "position": null,
  "size": null,
  "status": null,
  "width": null,
} satisfies OrderedAttachmentSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as OrderedAttachmentSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


