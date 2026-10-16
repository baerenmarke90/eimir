
# ContentVisibility

Domain visibility from specification section 15.  Requests name visibility rather than a privacy class. ``privacyClass`` is a server-side derivation and is never a client-settable field.  The type lives here rather than in one domain because several domains use the same vocabulary: RelatedPerson, ImportantDate, and HeartMoment should not depend on whichever feature happened to need it first.

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { ContentVisibility } from ''

// TODO: Update the object below with actual values
const example = {
} satisfies ContentVisibility

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ContentVisibility
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


