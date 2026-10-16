
# PartnerVibeProjection

Named discriminated partner Vibe state without hidden optional fields.

## Properties

Name | Type
------------ | -------------
`state` | string
`value` | [DailyVibe](DailyVibe.md)

## Example

```typescript
import type { PartnerVibeProjection } from ''

// TODO: Update the object below with actual values
const example = {
  "state": null,
  "value": null,
} satisfies PartnerVibeProjection

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerVibeProjection
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


