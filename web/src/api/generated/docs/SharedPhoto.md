
# SharedPhoto


## Properties

Name | Type
------------ | -------------
`attachment` | [AttachmentSummary](AttachmentSummary.md)
`effectiveDate` | Date
`parentId` | string
`parentType` | [PhotoParentType](PhotoParentType.md)

## Example

```typescript
import type { SharedPhoto } from ''

// TODO: Update the object below with actual values
const example = {
  "attachment": null,
  "effectiveDate": null,
  "parentId": null,
  "parentType": null,
} satisfies SharedPhoto

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SharedPhoto
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


