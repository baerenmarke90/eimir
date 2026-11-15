
# StoreChannelView


## Properties

Name | Type
------------ | -------------
`manageUrl` | string
`plans` | [Array&lt;StorePlanView&gt;](StorePlanView.md)
`productId` | string
`store` | [StoreChannel](StoreChannel.md)

## Example

```typescript
import type { StoreChannelView } from ''

// TODO: Update the object below with actual values
const example = {
  "manageUrl": null,
  "plans": null,
  "productId": null,
  "store": null,
} satisfies StoreChannelView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StoreChannelView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


