
# GiftCodeView

One code with its derived state; ``redeemedSpaceId`` links to the Space file.

## Properties

Name | Type
------------ | -------------
`code` | string
`handedOutAt` | Date
`id` | string
`redeemedAt` | Date
`redeemedSpaceId` | string
`state` | string

## Example

```typescript
import type { GiftCodeView } from ''

// TODO: Update the object below with actual values
const example = {
  "code": null,
  "handedOutAt": null,
  "id": null,
  "redeemedAt": null,
  "redeemedSpaceId": null,
  "state": null,
} satisfies GiftCodeView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftCodeView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


