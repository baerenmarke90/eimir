
# ReadDescriptor


## Properties

Name | Type
------------ | -------------
`expiresAt` | Date
`mediaType` | [MediaType](MediaType.md)
`method` | string
`url` | string

## Example

```typescript
import type { ReadDescriptor } from ''

// TODO: Update the object below with actual values
const example = {
  "expiresAt": null,
  "mediaType": null,
  "method": null,
  "url": null,
} satisfies ReadDescriptor

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ReadDescriptor
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


