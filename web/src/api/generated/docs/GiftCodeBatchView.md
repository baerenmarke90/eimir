
# GiftCodeBatchView

A batch with its codes in creation order.

## Properties

Name | Type
------------ | -------------
`codes` | [Array&lt;GiftCodeView&gt;](GiftCodeView.md)
`createdAt` | Date
`durationMonths` | number
`expired` | number
`handedOut` | number
`id` | string
`note` | string
`open` | number
`redeemableUntil` | Date
`redeemed` | number
`revoked` | number
`revokedAt` | Date
`total` | number

## Example

```typescript
import type { GiftCodeBatchView } from ''

// TODO: Update the object below with actual values
const example = {
  "codes": null,
  "createdAt": null,
  "durationMonths": null,
  "expired": null,
  "handedOut": null,
  "id": null,
  "note": null,
  "open": null,
  "redeemableUntil": null,
  "redeemed": null,
  "revoked": null,
  "revokedAt": null,
  "total": null,
} satisfies GiftCodeBatchView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftCodeBatchView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


