
# HeartEmotion

Emotions defined by the M2 domain contract.  This is a closed value set but not metadata: the value lives in the ProtectedPayload rather than a dedicated column. See M2-D06.

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { HeartEmotion } from ''

// TODO: Update the object below with actual values
const example = {
} satisfies HeartEmotion

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HeartEmotion
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


