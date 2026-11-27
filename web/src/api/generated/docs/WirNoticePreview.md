
# WirNoticePreview

Authorized content for a Wir tile, read afresh; never stored in the notice.

## Properties

Name | Type
------------ | -------------
`items` | Array&lt;string&gt;
`moreItems` | number
`reaction` | string
`text` | string

## Example

```typescript
import type { WirNoticePreview } from ''

// TODO: Update the object below with actual values
const example = {
  "items": null,
  "moreItems": null,
  "reaction": null,
  "text": null,
} satisfies WirNoticePreview

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WirNoticePreview
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


