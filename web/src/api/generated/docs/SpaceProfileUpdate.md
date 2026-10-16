
# SpaceProfileUpdate

Complete replacement state for a relationship profile.  All three fields are required. Otherwise an omitted field could not be distinguished from clearing it, and that distinction determines whether a relationship start date is preserved or removed. ``relationshipStartedOn`` is explicitly removed by sending ``null``.

## Properties

Name | Type
------------ | -------------
`durationDisplayMode` | [DurationDisplayMode](DurationDisplayMode.md)
`relationshipStartedOn` | Date
`showRelationshipDuration` | boolean

## Example

```typescript
import type { SpaceProfileUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "durationDisplayMode": null,
  "relationshipStartedOn": null,
  "showRelationshipDuration": null,
} satisfies SpaceProfileUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SpaceProfileUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


