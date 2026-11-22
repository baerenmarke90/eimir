# GamesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acknowledgeGardenNews**](GamesApi.md#acknowledgegardennews) | **POST** /api/v1/spaces/{spaceId}/games/garden/news/seen | Acknowledge Garden News |
| [**answerWhoOfUsRemoteQuestion**](GamesApi.md#answerwhoofusremotequestion) | **POST** /api/v1/spaces/{spaceId}/games/who-of-us/answers | Answer Who Of Us Remote Question |
| [**closeGardenBouquet**](GamesApi.md#closegardenbouquet) | **POST** /api/v1/spaces/{spaceId}/games/garden/bouquets/{bouquetId}/close | Close Garden Bouquet |
| [**createHeartHuntRound**](GamesApi.md#createhearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds | Create Round |
| [**endOurMomentsRemoteGame**](GamesApi.md#endourmomentsremotegame) | **POST** /api/v1/spaces/{spaceId}/games/our-moments/end | End Our Moments Remote Game |
| [**endWhoOfUsRemoteGame**](GamesApi.md#endwhoofusremotegame) | **POST** /api/v1/spaces/{spaceId}/games/who-of-us/end | End Who Of Us Remote Game |
| [**endWishDetectiveRemoteGame**](GamesApi.md#endwishdetectiveremotegame) | **POST** /api/v1/spaces/{spaceId}/games/wish-detective/end | End Wish Detective Remote Game |
| [**finishPicturePingPong**](GamesApi.md#finishpicturepingpong) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/finish | Finish Picture Ping Pong |
| [**flipOurMomentsRemoteCard**](GamesApi.md#flipourmomentsremotecard) | **POST** /api/v1/spaces/{spaceId}/games/our-moments/flips | Flip Our Moments Remote Card |
| [**getCoupleExperienceQuestions**](GamesApi.md#getcoupleexperiencequestions) | **GET** /api/v1/spaces/{spaceId}/experiences/{kind}/questions | Get Couple Experience Questions |
| [**getGameMomentCandidates**](GamesApi.md#getgamemomentcandidates) | **GET** /api/v1/spaces/{spaceId}/games/moments/candidates | Get Game Moment Candidates |
| [**getGameWishCandidates**](GamesApi.md#getgamewishcandidates) | **GET** /api/v1/spaces/{spaceId}/games/wishes/candidates | Get Game Wish Candidates |
| [**getGarden**](GamesApi.md#getgarden) | **GET** /api/v1/spaces/{spaceId}/games/garden | Get Garden |
| [**getHeartHunt**](GamesApi.md#gethearthunt) | **GET** /api/v1/spaces/{spaceId}/games/heart-hunt | Get Heart Hunt |
| [**getOurMomentsRemoteGame**](GamesApi.md#getourmomentsremotegame) | **GET** /api/v1/spaces/{spaceId}/games/our-moments | Get Our Moments Remote Game |
| [**getPicturePingPong**](GamesApi.md#getpicturepingpong) | **GET** /api/v1/spaces/{spaceId}/games/picture-ping-pong | Get Picture Ping Pong |
| [**getWaitingGames**](GamesApi.md#getwaitinggames) | **GET** /api/v1/spaces/{spaceId}/games/waiting | Get Waiting Games |
| [**getWhoOfUsRemoteGame**](GamesApi.md#getwhoofusremotegame) | **GET** /api/v1/spaces/{spaceId}/games/who-of-us | Get Who Of Us Remote Game |
| [**getWishDetectiveRemoteGame**](GamesApi.md#getwishdetectiveremotegame) | **GET** /api/v1/spaces/{spaceId}/games/wish-detective | Get Wish Detective Remote Game |
| [**giveGardenBouquet**](GamesApi.md#givegardenbouquet) | **POST** /api/v1/spaces/{spaceId}/games/garden/bouquets | Give Garden Bouquet |
| [**guessWishDetectiveRemoteWish**](GamesApi.md#guesswishdetectiveremotewish) | **POST** /api/v1/spaces/{spaceId}/games/wish-detective/guesses | Guess Wish Detective Remote Wish |
| [**handOverPicturePingPongTurn**](GamesApi.md#handoverpicturepingpongturn) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/turns | Hand Over Picture Ping Pong Turn |
| [**keepHeartHuntRound**](GamesApi.md#keephearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/kept | Keep Round |
| [**listGardenHistory**](GamesApi.md#listgardenhistory) | **GET** /api/v1/spaces/{spaceId}/games/garden/history | List Garden History |
| [**markPicturePingPongSaved**](GamesApi.md#markpicturepingpongsaved) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong/saved | Mark Picture Ping Pong Saved |
| [**nameGardenVisitor**](GamesApi.md#namegardenvisitor) | **PUT** /api/v1/spaces/{spaceId}/games/garden/visitors/{animal}/name | Name Garden Visitor |
| [**plantGardenSeed**](GamesApi.md#plantgardenseed) | **POST** /api/v1/spaces/{spaceId}/games/garden/seeds/{seedId}/plant | Plant Garden Seed |
| [**renameGarden**](GamesApi.md#renamegarden) | **PUT** /api/v1/spaces/{spaceId}/games/garden/name | Rename Garden |
| [**sendGardenSeed**](GamesApi.md#sendgardenseed) | **POST** /api/v1/spaces/{spaceId}/games/garden/seeds | Send Garden Seed |
| [**skipWishDetectiveRemoteWish**](GamesApi.md#skipwishdetectiveremotewish) | **POST** /api/v1/spaces/{spaceId}/games/wish-detective/skip | Skip Wish Detective Remote Wish |
| [**startOurMomentsRemoteGame**](GamesApi.md#startourmomentsremotegame) | **POST** /api/v1/spaces/{spaceId}/games/our-moments | Start Our Moments Remote Game |
| [**startPicturePingPong**](GamesApi.md#startpicturepingpong) | **POST** /api/v1/spaces/{spaceId}/games/picture-ping-pong | Start Picture Ping Pong |
| [**startWhoOfUsRemoteGame**](GamesApi.md#startwhoofusremotegame) | **POST** /api/v1/spaces/{spaceId}/games/who-of-us | Start Who Of Us Remote Game |
| [**startWishDetectiveRemoteGame**](GamesApi.md#startwishdetectiveremotegame) | **POST** /api/v1/spaces/{spaceId}/games/wish-detective | Start Wish Detective Remote Game |
| [**submitWishDetectiveRemoteClues**](GamesApi.md#submitwishdetectiveremoteclues) | **POST** /api/v1/spaces/{spaceId}/games/wish-detective/clues | Submit Wish Detective Remote Clues |
| [**tapHeartHuntRound**](GamesApi.md#taphearthuntround) | **POST** /api/v1/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/taps | Tap Round |
| [**waterGardenPlant**](GamesApi.md#watergardenplant) | **POST** /api/v1/spaces/{spaceId}/games/garden/waterings | Water Garden Plant |



## acknowledgeGardenNews

> GardenView acknowledgeGardenNews(spaceId)

Acknowledge Garden News

The reader saw what is new in the garden; each unlock is shown once.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { AcknowledgeGardenNewsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies AcknowledgeGardenNewsRequest;

  try {
    const data = await api.acknowledgeGardenNews(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## answerWhoOfUsRemoteQuestion

> WhoOfUsRemoteState answerWhoOfUsRemoteQuestion(spaceId, whoOfUsAnswerInput)

Answer Who Of Us Remote Question

Answer one question; an answer cannot be changed afterwards.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { AnswerWhoOfUsRemoteQuestionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // WhoOfUsAnswerInput
    whoOfUsAnswerInput: ...,
  } satisfies AnswerWhoOfUsRemoteQuestionRequest;

  try {
    const data = await api.answerWhoOfUsRemoteQuestion(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **whoOfUsAnswerInput** | [WhoOfUsAnswerInput](WhoOfUsAnswerInput.md) |  | |

### Return type

[**WhoOfUsRemoteState**](WhoOfUsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## closeGardenBouquet

> GardenView closeGardenBouquet(bouquetId, spaceId, gardenBouquetCloseInput)

Close Garden Bouquet

Close a received bouquet\&#39;s card, optionally noting it went into Momente.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { CloseGardenBouquetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    bouquetId: bouquetId_example,
    // string
    spaceId: spaceId_example,
    // GardenBouquetCloseInput
    gardenBouquetCloseInput: ...,
  } satisfies CloseGardenBouquetRequest;

  try {
    const data = await api.closeGardenBouquet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **bouquetId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenBouquetCloseInput** | [GardenBouquetCloseInput](GardenBouquetCloseInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createHeartHuntRound

> HeartHuntRoundView createHeartHuntRound(spaceId, heartHuntRoundCreate)

Create Round

Hide a heart in an uploaded photo and send it to the partner.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { CreateHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // HeartHuntRoundCreate
    heartHuntRoundCreate: ...,
  } satisfies CreateHeartHuntRoundRequest;

  try {
    const data = await api.createHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntRoundCreate** | [HeartHuntRoundCreate](HeartHuntRoundCreate.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## endOurMomentsRemoteGame

> OurMomentsRemoteState endOurMomentsRemoteGame(spaceId, coupleGameEndInput)

End Our Moments Remote Game

Either partner may end the open board; found pairs stay readable.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { EndOurMomentsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // CoupleGameEndInput
    coupleGameEndInput: ...,
  } satisfies EndOurMomentsRemoteGameRequest;

  try {
    const data = await api.endOurMomentsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **coupleGameEndInput** | [CoupleGameEndInput](CoupleGameEndInput.md) |  | |

### Return type

[**OurMomentsRemoteState**](OurMomentsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## endWhoOfUsRemoteGame

> WhoOfUsRemoteState endWhoOfUsRemoteGame(spaceId, coupleGameEndInput)

End Who Of Us Remote Game

Either partner may end the open game; the revealed answers stay readable.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { EndWhoOfUsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // CoupleGameEndInput
    coupleGameEndInput: ...,
  } satisfies EndWhoOfUsRemoteGameRequest;

  try {
    const data = await api.endWhoOfUsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **coupleGameEndInput** | [CoupleGameEndInput](CoupleGameEndInput.md) |  | |

### Return type

[**WhoOfUsRemoteState**](WhoOfUsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## endWishDetectiveRemoteGame

> WishDetectiveRemoteState endWishDetectiveRemoteGame(spaceId, coupleGameEndInput)

End Wish Detective Remote Game

Either partner may end the open game; revealed rounds stay readable.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { EndWishDetectiveRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // CoupleGameEndInput
    coupleGameEndInput: ...,
  } satisfies EndWishDetectiveRemoteGameRequest;

  try {
    const data = await api.endWishDetectiveRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **coupleGameEndInput** | [CoupleGameEndInput](CoupleGameEndInput.md) |  | |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finishPicturePingPong

> PicturePingPongState finishPicturePingPong(spaceId, pictureFinishInput)

Finish Picture Ping Pong

Either partner may call the picture finished early.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { FinishPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureFinishInput
    pictureFinishInput: ...,
  } satisfies FinishPicturePingPongRequest;

  try {
    const data = await api.finishPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureFinishInput** | [PictureFinishInput](PictureFinishInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## flipOurMomentsRemoteCard

> OurMomentsRemoteState flipOurMomentsRemoteCard(spaceId, ourMomentsFlipInput)

Flip Our Moments Remote Card

Flip one card; the second card of a turn is judged at once.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { FlipOurMomentsRemoteCardRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // OurMomentsFlipInput
    ourMomentsFlipInput: ...,
  } satisfies FlipOurMomentsRemoteCardRequest;

  try {
    const data = await api.flipOurMomentsRemoteCard(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ourMomentsFlipInput** | [OurMomentsFlipInput](OurMomentsFlipInput.md) |  | |

### Return type

[**OurMomentsRemoteState**](OurMomentsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getCoupleExperienceQuestions

> CoupleExperienceQuestions getCoupleExperienceQuestions(kind, spaceId)

Get Couple Experience Questions

Three stable inspirations per shared calendar day, without an answer limit.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetCoupleExperienceQuestionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // ExperienceKind
    kind: ...,
    // string
    spaceId: spaceId_example,
  } satisfies GetCoupleExperienceQuestionsRequest;

  try {
    const data = await api.getCoupleExperienceQuestions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **kind** | `ExperienceKind` |  | [Defaults to `undefined`] [Enum: HAPPINESS, TIME_TRAVEL] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CoupleExperienceQuestions**](CoupleExperienceQuestions.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameMomentCandidates

> GameMemoryCandidateSet getGameMomentCandidates(spaceId)

Get Game Moment Candidates

Return Premium-authorized shared photo Memories for the first #863 grammar.  Normal authentication and Space membership are resolved before this route receives &#x60;authorization&#x60;. Commercial entitlement is then enforced on the server. The actual content query remains constrained by the existing &#x60;readable()&#x60; authorization predicate and existing attachment bindings.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameMomentCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameMomentCandidatesRequest;

  try {
    const data = await api.getGameMomentCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameMemoryCandidateSet**](GameMemoryCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGameWishCandidates

> GameWishCandidateSet getGameWishCandidates(spaceId)

Get Game Wish Candidates

Return Premium-authorized OPEN shared Wishes for #864.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGameWishCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGameWishCandidatesRequest;

  try {
    const data = await api.getGameWishCandidates(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GameWishCandidateSet**](GameWishCandidateSet.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGarden

> GardenView getGarden(spaceId)

Get Garden

The shared garden and today\&#39;s step for the reader.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetGardenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetGardenRequest;

  try {
    const data = await api.getGarden(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getHeartHunt

> HeartHuntState getHeartHunt(spaceId)

Get Heart Hunt

Open rounds of the two partners; the seeker never receives the heart early.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetHeartHuntRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetHeartHuntRequest;

  try {
    const data = await api.getHeartHunt(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**HeartHuntState**](HeartHuntState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getOurMomentsRemoteGame

> OurMomentsRemoteState getOurMomentsRemoteGame(spaceId)

Get Our Moments Remote Game

The current or last remote memory board, with only flipped cards revealed.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetOurMomentsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetOurMomentsRemoteGameRequest;

  try {
    const data = await api.getOurMomentsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**OurMomentsRemoteState**](OurMomentsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPicturePingPong

> PicturePingPongState getPicturePingPong(spaceId)

Get Picture Ping Pong

The current shared picture, or &#x60;null&#x60; when none was started.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPicturePingPongRequest;

  try {
    const data = await api.getPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWaitingGames

> WaitingGames getWaitingGames(spaceId)

Get Waiting Games

Games that wait on the reader, for Wir (#2158 C); never their content.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetWaitingGamesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWaitingGamesRequest;

  try {
    const data = await api.getWaitingGames(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WaitingGames**](WaitingGames.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWhoOfUsRemoteGame

> WhoOfUsRemoteState getWhoOfUsRemoteGame(spaceId)

Get Who Of Us Remote Game

The current or last remote Who of us game, as the reader may see it.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetWhoOfUsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWhoOfUsRemoteGameRequest;

  try {
    const data = await api.getWhoOfUsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WhoOfUsRemoteState**](WhoOfUsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWishDetectiveRemoteGame

> WishDetectiveRemoteState getWishDetectiveRemoteGame(spaceId)

Get Wish Detective Remote Game

The current or last remote Wish detective game, as the reader may see it.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GetWishDetectiveRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWishDetectiveRemoteGameRequest;

  try {
    const data = await api.getWishDetectiveRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## giveGardenBouquet

> GardenView giveGardenBouquet(spaceId, gardenBouquetInput)

Give Garden Bouquet

Give up to three blooming flowers to the partner; a seed stays in each place.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GiveGardenBouquetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenBouquetInput
    gardenBouquetInput: ...,
  } satisfies GiveGardenBouquetRequest;

  try {
    const data = await api.giveGardenBouquet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenBouquetInput** | [GardenBouquetInput](GardenBouquetInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## guessWishDetectiveRemoteWish

> WishDetectiveRemoteState guessWishDetectiveRemoteWish(spaceId, wishDetectiveGuessInput)

Guess Wish Detective Remote Wish

The guesser guesses (or passes); the round is revealed to both.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { GuessWishDetectiveRemoteWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // WishDetectiveGuessInput
    wishDetectiveGuessInput: ...,
  } satisfies GuessWishDetectiveRemoteWishRequest;

  try {
    const data = await api.guessWishDetectiveRemoteWish(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **wishDetectiveGuessInput** | [WishDetectiveGuessInput](WishDetectiveGuessInput.md) |  | |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## handOverPicturePingPongTurn

> PicturePingPongState handOverPicturePingPongTurn(spaceId, pictureTurnInput)

Hand Over Picture Ping Pong Turn

Add up to three strokes for the current turn and pass the picture on.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { HandOverPicturePingPongTurnRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureTurnInput
    pictureTurnInput: ...,
  } satisfies HandOverPicturePingPongTurnRequest;

  try {
    const data = await api.handOverPicturePingPongTurn(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureTurnInput** | [PictureTurnInput](PictureTurnInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## keepHeartHuntRound

> HeartHuntRoundView keepHeartHuntRound(roundId, spaceId, heartHuntKept)

Keep Round

Record that the found photo was saved as a shared Moment by explicit tap.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { KeepHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntKept
    heartHuntKept: ...,
  } satisfies KeepHeartHuntRoundRequest;

  try {
    const data = await api.keepHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntKept** | [HeartHuntKept](HeartHuntKept.md) |  | |

### Return type

[**HeartHuntRoundView**](HeartHuntRoundView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listGardenHistory

> GardenHistoryPage listGardenHistory(spaceId, cursor, limit)

List Garden History

What happened in the garden between the two partners, newest first.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { ListGardenHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListGardenHistoryRequest;

  try {
    const data = await api.listGardenHistory(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `20`] |

### Return type

[**GardenHistoryPage**](GardenHistoryPage.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **400** | The request is syntactically valid but cannot be processed in this form. |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## markPicturePingPongSaved

> PicturePingPongState markPicturePingPongSaved(spaceId, pictureSavedInput)

Mark Picture Ping Pong Saved

Record the Memory the finished picture was saved to (explicit tap only).

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { MarkPicturePingPongSavedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureSavedInput
    pictureSavedInput: ...,
  } satisfies MarkPicturePingPongSavedRequest;

  try {
    const data = await api.markPicturePingPongSaved(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureSavedInput** | [PictureSavedInput](PictureSavedInput.md) |  | |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## nameGardenVisitor

> GardenView nameGardenVisitor(animal, spaceId, gardenVisitorNameInput)

Name Garden Visitor

Name a visiting animal; both partners see the same name (the duck pair shares one).

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { NameGardenVisitorRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // GardenVisitor
    animal: ...,
    // string
    spaceId: spaceId_example,
    // GardenVisitorNameInput
    gardenVisitorNameInput: ...,
  } satisfies NameGardenVisitorRequest;

  try {
    const data = await api.nameGardenVisitor(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **animal** | `GardenVisitor` |  | [Defaults to `undefined`] [Enum: SNAIL, RABBIT, HEDGEHOG, DUCKS, SQUIRREL, DEER] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenVisitorNameInput** | [GardenVisitorNameInput](GardenVisitorNameInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## plantGardenSeed

> GardenView plantGardenSeed(seedId, spaceId)

Plant Garden Seed

Plant a seed that arrived for the reader.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { PlantGardenSeedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    seedId: seedId_example,
    // string
    spaceId: spaceId_example,
  } satisfies PlantGardenSeedRequest;

  try {
    const data = await api.plantGardenSeed(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **seedId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## renameGarden

> GardenView renameGarden(spaceId, gardenNameInput)

Rename Garden

Name the shared garden; it becomes the page title for both partners.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { RenameGardenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenNameInput
    gardenNameInput: ...,
  } satisfies RenameGardenRequest;

  try {
    const data = await api.renameGarden(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenNameInput** | [GardenNameInput](GardenNameInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## sendGardenSeed

> GardenView sendGardenSeed(spaceId, gardenSeedInput)

Send Garden Seed

Send today\&#39;s seed to the partner; one per partner and day.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { SendGardenSeedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenSeedInput
    gardenSeedInput: ...,
  } satisfies SendGardenSeedRequest;

  try {
    const data = await api.sendGardenSeed(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenSeedInput** | [GardenSeedInput](GardenSeedInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## skipWishDetectiveRemoteWish

> WishDetectiveRemoteState skipWishDetectiveRemoteWish(spaceId, wishDetectiveSkipInput)

Skip Wish Detective Remote Wish

The giver draws another own wish (three times per round).

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { SkipWishDetectiveRemoteWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // WishDetectiveSkipInput
    wishDetectiveSkipInput: ...,
  } satisfies SkipWishDetectiveRemoteWishRequest;

  try {
    const data = await api.skipWishDetectiveRemoteWish(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **wishDetectiveSkipInput** | [WishDetectiveSkipInput](WishDetectiveSkipInput.md) |  | |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startOurMomentsRemoteGame

> OurMomentsRemoteState startOurMomentsRemoteGame(spaceId)

Start Our Moments Remote Game

Lay out a new board; the opener flips first.  It needs at least three photo Memories both partners may read (&#x60;OUR_MOMENTS_MOMENTS_MISSING&#x60; otherwise).

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { StartOurMomentsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies StartOurMomentsRemoteGameRequest;

  try {
    const data = await api.startOurMomentsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**OurMomentsRemoteState**](OurMomentsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startPicturePingPong

> PicturePingPongState startPicturePingPong(spaceId, pictureStartInput)

Start Picture Ping Pong

Open a new picture; the partner who opens it draws first.  Without a body the picture begins with the seed squiggle.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { StartPicturePingPongRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PictureStartInput (optional)
    pictureStartInput: ...,
  } satisfies StartPicturePingPongRequest;

  try {
    const data = await api.startPicturePingPong(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **pictureStartInput** | [PictureStartInput](PictureStartInput.md) |  | [Optional] |

### Return type

[**PicturePingPongState**](PicturePingPongState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startWhoOfUsRemoteGame

> WhoOfUsRemoteState startWhoOfUsRemoteGame(spaceId)

Start Who Of Us Remote Game

Open a remote game; it replaces a finished or ended one.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { StartWhoOfUsRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies StartWhoOfUsRemoteGameRequest;

  try {
    const data = await api.startWhoOfUsRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WhoOfUsRemoteState**](WhoOfUsRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startWishDetectiveRemoteGame

> WishDetectiveRemoteState startWishDetectiveRemoteGame(spaceId)

Start Wish Detective Remote Game

Open a remote game; the opener gives the first clues.  Each partner needs at least one OPEN wish. Otherwise the problem code says who is missing one: &#x60;WISH_DETECTIVE_OWN_WISH_MISSING&#x60;, &#x60;WISH_DETECTIVE_PARTNER_WISH_MISSING&#x60; or &#x60;WISH_DETECTIVE_WISHES_MISSING&#x60;.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { StartWishDetectiveRemoteGameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies StartWishDetectiveRemoteGameRequest;

  try {
    const data = await api.startWishDetectiveRemoteGame(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## submitWishDetectiveRemoteClues

> WishDetectiveRemoteState submitWishDetectiveRemoteClues(spaceId, wishDetectiveCluesInput)

Submit Wish Detective Remote Clues

The giver hands three clues to the guesser.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { SubmitWishDetectiveRemoteCluesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // WishDetectiveCluesInput
    wishDetectiveCluesInput: ...,
  } satisfies SubmitWishDetectiveRemoteCluesRequest;

  try {
    const data = await api.submitWishDetectiveRemoteClues(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **wishDetectiveCluesInput** | [WishDetectiveCluesInput](WishDetectiveCluesInput.md) |  | |

### Return type

[**WishDetectiveRemoteState**](WishDetectiveRemoteState.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## tapHeartHuntRound

> HeartHuntTapResult tapHeartHuntRound(roundId, spaceId, heartHuntTap)

Tap Round

Clear fog at a tap; the answer is a coarse warmth and whether the heart was found.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { TapHeartHuntRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    roundId: roundId_example,
    // string
    spaceId: spaceId_example,
    // HeartHuntTap
    heartHuntTap: ...,
  } satisfies TapHeartHuntRoundRequest;

  try {
    const data = await api.tapHeartHuntRound(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **roundId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **heartHuntTap** | [HeartHuntTap](HeartHuntTap.md) |  | |

### Return type

[**HeartHuntTapResult**](HeartHuntTapResult.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## waterGardenPlant

> GardenView waterGardenPlant(spaceId, gardenWateringInput)

Water Garden Plant

Water one plant; a daily gesture that never changes growth.

### Example

```ts
import {
  Configuration,
  GamesApi,
} from '';
import type { WaterGardenPlantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GamesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GardenWateringInput
    gardenWateringInput: ...,
  } satisfies WaterGardenPlantRequest;

  try {
    const data = await api.waterGardenPlant(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **gardenWateringInput** | [GardenWateringInput](GardenWateringInput.md) |  | |

### Return type

[**GardenView**](GardenView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

