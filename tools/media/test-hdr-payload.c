/* Regression for initialized, parseable HDR10+ payloads without tone mapping. */
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include "libavutil/hdr_dynamic_metadata.h"

int main(void)
{
    for (int windows = 1; windows <= 3; windows++) {
        AVDynamicHDRPlus source = {0}, decoded = {0};
        source.num_windows = windows;
        source.targeted_system_display_maximum_luminance = (AVRational){1000, 1};
        for (int w = 0; w < windows; w++) {
            AVHDRPlusColorTransformParams *p = &source.params[w];
            p->window_upper_left_corner_x = p->window_upper_left_corner_y = (AVRational){0, 1};
            p->window_lower_right_corner_x = p->window_lower_right_corner_y = (AVRational){1, 1};
            for (int c = 0; c < 3; c++) p->maxscl[c] = (AVRational){0, 1};
            p->average_maxrgb = p->fraction_bright_pixels = (AVRational){0, 1};
            p->color_saturation_mapping_flag = 1;
            p->color_saturation_weight = (AVRational){1, 2};
        }
        uint8_t first[1024], second[1024];
        memset(first, 0xA5, sizeof(first));
        memset(second, 0x5A, sizeof(second));
        uint8_t *a = first, *b = second;
        size_t a_size = sizeof(first), b_size = sizeof(second);
        assert(av_dynamic_hdr_plus_to_t35(&source, &a, &a_size) == 0);
        assert(av_dynamic_hdr_plus_to_t35(&source, &b, &b_size) == 0);
        assert(a_size == b_size && a_size < sizeof(first));
        assert(memcmp(first, second, a_size) == 0);
        assert(first[a_size] == 0xA5 && second[b_size] == 0x5A);
        assert(av_dynamic_hdr_plus_from_t35(&decoded, first, a_size) == 0);
        assert(decoded.num_windows == windows);
        for (int w = 0; w < windows; w++) {
            assert(decoded.params[w].tone_mapping_flag == 0);
            assert(decoded.params[w].color_saturation_mapping_flag == 1);
            assert(decoded.params[w].color_saturation_weight.num * 2 ==
                   decoded.params[w].color_saturation_weight.den);
        }
    }
    return 0;
}
