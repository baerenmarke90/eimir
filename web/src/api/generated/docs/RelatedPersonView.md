
# RelatedPersonView


## Properties

Name | Type
------------ | -------------
`avatarAttachmentId` | string
`birthday` | Date
`birthdayYearKnown` | boolean
`createdAt` | Date
`displayName` | string
`id` | string
`relationship` | [PersonRelationship](PersonRelationship.md)
`showBirthdayOnDashboard` | boolean
`updatedAt` | Date
`version` | number
`visibility` | [ContentVisibility](ContentVisibility.md)

## Example

```typescript
import type { RelatedPersonView } from ''

// TODO: Update the object below with actual values
const example = {
  "avatarAttachmentId": null,
  "birthday": null,
  "birthdayYearKnown": null,
  "createdAt": null,
  "displayName": null,
  "id": null,
  "relationship": null,
  "showBirthdayOnDashboard": null,
  "updatedAt": null,
  "version": null,
  "visibility": null,
} satisfies RelatedPersonView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RelatedPersonView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


