
# PartnerProfileView


## Properties

Name | Type
------------ | -------------
`accountId` | string
`birthday` | Date
`createdAt` | Date
`displayName` | string
`id` | string
`preferences` | [Array&lt;ProfilePreferenceView&gt;](ProfilePreferenceView.md)
`profileAttachmentId` | string
`updatedAt` | Date
`version` | number

## Example

```typescript
import type { PartnerProfileView } from ''

// TODO: Update the object below with actual values
const example = {
  "accountId": null,
  "birthday": null,
  "createdAt": null,
  "displayName": null,
  "id": null,
  "preferences": null,
  "profileAttachmentId": null,
  "updatedAt": null,
  "version": null,
} satisfies PartnerProfileView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerProfileView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


