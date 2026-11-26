
# SupportReplyTemplateView

One reply template: a short name for the chip and the text it inserts.

## Properties

Name | Type
------------ | -------------
`createdAt` | Date
`id` | string
`name` | string
`text` | string
`updatedAt` | Date

## Example

```typescript
import type { SupportReplyTemplateView } from ''

// TODO: Update the object below with actual values
const example = {
  "createdAt": null,
  "id": null,
  "name": null,
  "text": null,
  "updatedAt": null,
} satisfies SupportReplyTemplateView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReplyTemplateView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


