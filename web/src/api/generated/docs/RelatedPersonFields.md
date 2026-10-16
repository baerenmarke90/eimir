
# RelatedPersonFields


## Properties

Name | Type
------------ | -------------
`avatarAttachmentId` | string
`birthday` | Date
`birthdayYearKnown` | boolean
`displayName` | string
`relationship` | [PersonRelationship](PersonRelationship.md)
`showBirthdayOnDashboard` | boolean
`visibility` | [ContentVisibility](ContentVisibility.md)

## Example

```typescript
import type { RelatedPersonFields } from ''

// TODO: Update the object below with actual values
const example = {
  "avatarAttachmentId": null,
  "birthday": null,
  "birthdayYearKnown": null,
  "displayName": null,
  "relationship": null,
  "showBirthdayOnDashboard": null,
  "visibility": null,
} satisfies RelatedPersonFields

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RelatedPersonFields
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


