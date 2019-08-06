function patternsearch(U8ABuf, U8APat, nOffset) {
    var nCur = nOffset;
    var result = 0;
    while (nCur <= U8ABuf.length - U8APat.length) {
        var add = 0;
        var mat = 1;
        for (var i = 0; i < U8APat.length; i++) {
            if (U8APat[0] == U8ABuf[nCur + i]) {
                add = i;
            }
            if (U8APat[i] != U8ABuf[nCur + i]) {
                mat = 0;
            }
            if (add != 0 && mat == 0) {
                break;
            }
        }
        if (mat == 1) {
            result = nCur;
            break;
        }
        if (add == 0) {
            add = U8APat.length;
        }
        nCur += add;
    }
    return result;
}
function depthtojpg(i_u8aDepth) {
    var pattern = [0xFF, 0xD8, 0xFF, 0xE1];
    var nOff = Math.floor(i_u8aDepth.length / 2);
    var dptsdr = patternsearch(i_u8aDepth, pattern, nOff);
    var dptjpg = null;
    if (dptsdr > 0) {
        dptjpg = i_u8aDepth.subarray(dptsdr, i_u8aDepth.length);
        pattern = [0x64, 0x65, 0x70, 0x74, 0x68];
        var dptcheck = patternsearch(dptjpg, pattern, 0);
        if (dptcheck == 0) dptjpg = null;
    }
    return dptjpg;
}