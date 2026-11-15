
# ExperienceAnswer


## Properties

Name | Type
------------ | -------------
`attachments` | [Array&lt;MemoryAttachmentSummary&gt;](MemoryAttachmentSummary.md)
`author` | [AuthorSummary](AuthorSummary.md)
`body` | string
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`id` | string
`version` | number

## Example

```typescript
import type { ExperienceAnswer } from ''

// TODO: Update the object below with actual values
const example = {
  "attachments": null,
  "author": null,
  "body": null,
  "capabilities": null,
  "id": null,
  "version": null,
} satisfies ExperienceAnswer

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ExperienceAnswer
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


