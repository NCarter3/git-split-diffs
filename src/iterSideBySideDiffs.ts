import * as assert from 'assert';
import { Theme, ThemeColor } from './themes';
import { Config } from './config';
import { wrapLineByWord } from './wrapLineByWord';

export function iterSideBySideDiff(
    {
        SCREEN_WIDTH,
        LINE_NUMBER_WIDTH,
        LINE_PREFIX_WIDTH,
        MIN_LINE_WIDTH,
        WRAP_LINES,
    }: Config,
    {
        COMMIT_COLOR,
        COMMIT_SHA_COLOR,
        COMMIT_AUTHOR_COLOR,
        COMMIT_DATE_COLOR,
        BORDER_COLOR,
        FILE_NAME_COLOR,
        HUNK_HEADER_COLOR,
        DELETED_LINE_COLOR,
        DELETED_LINE_NO_COLOR,
        INSERTED_LINE_COLOR,
        INSERTED_LINE_NO_COLOR,
        UNMODIFIED_LINE_COLOR,
        UNMODIFIED_LINE_NO_COLOR,
        MISSING_LINE_COLOR,
    }: Theme
) {
    /*
        Each line in a hunk is rendered as follows: <lineNo> <linePrefix[1]>
        <lineWithoutPrefix><lineNo> <linePrefix> <lineWithoutPrefix>

        So (LINE_NUMBER_WIDTH + 1 + LINE_PREFIX_WIDTH + 1 + LINE_TEXT_WIDTH) * 2
        = SCREEN_WIDTH
    */
    const LINE_WIDTH = Math.max(Math.floor(SCREEN_WIDTH / 2), MIN_LINE_WIDTH);
    const LINE_TEXT_WIDTH = Math.max(
        LINE_WIDTH - 1 - LINE_PREFIX_WIDTH - 1 - LINE_NUMBER_WIDTH
    );
    const BLANK_LINE = ''.padStart(LINE_WIDTH);
    const HORIZONTAL_SEPARATOR = BORDER_COLOR(''.padStart(SCREEN_WIDTH, '─'));

    /**
     * Wraps or truncates the given line to into the allowed width, depending on
     * the config.
     */
    function* fitTextToWidth(text: string, width: number): Iterable<string> {
        return WRAP_LINES
            ? yield* wrapLineByWord(text, width)
            : yield text.slice(0, width);
    }

    function formatCommitLine(line: string) {
        const [label] = line.split(' ', 1);

        let labelColor;
        switch (label) {
            case 'commit':
                labelColor = COMMIT_SHA_COLOR;
                break;
            case 'Author:':
                labelColor = COMMIT_AUTHOR_COLOR;
                break;
            case 'Date:':
                labelColor = COMMIT_DATE_COLOR;
                break;
            default:
                return COMMIT_COLOR(line.padEnd(SCREEN_WIDTH));
        }

        return COMMIT_COLOR(
            `${label} ${labelColor(line.slice(label.length + 1))}` +
                ''.padEnd(SCREEN_WIDTH - line.length)
        );
    }

    function* formatFileName(fileNameA: string, fileNameB: string) {
        yield HORIZONTAL_SEPARATOR;

        let indicator;
        let label;
        if (!fileNameA) {
            indicator = INSERTED_LINE_COLOR('■■');
            label = fileNameB;
        } else if (!fileNameB) {
            indicator = DELETED_LINE_COLOR('■■');
            label = fileNameA;
        } else if (fileNameA === fileNameB) {
            indicator = DELETED_LINE_COLOR('■') + INSERTED_LINE_COLOR('■');
            label = fileNameA;
        } else {
            indicator = DELETED_LINE_COLOR('■') + INSERTED_LINE_COLOR('■');
            label = FILE_NAME_COLOR(`${fileNameA} -> ${fileNameB}`);
        }
        yield FILE_NAME_COLOR(' ') +
            indicator +
            FILE_NAME_COLOR(' ' + label.padEnd(SCREEN_WIDTH - 2 - 2));

        yield HORIZONTAL_SEPARATOR;
    }

    type HunkLineHalf = {
        number: string;
        prefix: string;
        text: string;
    } | null /* if line is missing */;

    function lineColorForLineHalf(lineHalf: HunkLineHalf) {
        if (!lineHalf) {
            return MISSING_LINE_COLOR;
        }
        switch (lineHalf?.prefix) {
            case '-':
                return DELETED_LINE_COLOR;
            case '+':
                return INSERTED_LINE_COLOR;
            default:
                return UNMODIFIED_LINE_COLOR;
        }
    }

    function lineNoColorForLineHalf(lineHalf: HunkLineHalf) {
        if (!lineHalf) {
            return MISSING_LINE_COLOR;
        }
        switch (lineHalf?.prefix) {
            case '-':
                return DELETED_LINE_NO_COLOR;
            case '+':
                return INSERTED_LINE_NO_COLOR;
            default:
                return UNMODIFIED_LINE_NO_COLOR;
        }
    }

    function formatHunkLineHalf(
        lineNo: string,
        linePrefix: string,
        lineText: string,
        lineColor: ThemeColor,
        lineNoColor: ThemeColor
    ) {
        return [
            lineNoColor(lineNo.padStart(LINE_NUMBER_WIDTH)),
            lineColor(' ' + linePrefix.padStart(LINE_PREFIX_WIDTH)),
            lineColor(' ' + lineText.padEnd(LINE_TEXT_WIDTH)),
        ].join('');
    }

    function formatAndFitHunkLineHalf(
        lineHalf: HunkLineHalf,
        lineColor: ThemeColor,
        lineNoColor: ThemeColor
    ) {
        const lineNo = lineHalf?.number ?? '';
        const linePrefix = lineHalf?.prefix ?? '';
        const lineText = lineHalf?.text ?? '';

        let isFirstLine = true;
        const formattedHunkLineHalves = [];
        for (const text of fitTextToWidth(lineText, LINE_TEXT_WIDTH)) {
            formattedHunkLineHalves.push(
                formatHunkLineHalf(
                    isFirstLine ? lineNo : '',
                    isFirstLine ? linePrefix : '',
                    text,
                    lineColor,
                    lineNoColor
                )
            );
            isFirstLine = false;
        }
        return formattedHunkLineHalves;
    }

    function formatHunkLine(lineHalfA: HunkLineHalf, lineHalfB: HunkLineHalf) {
        const lineColorA = lineColorForLineHalf(lineHalfA);
        const lineNoColorA = lineNoColorForLineHalf(lineHalfA);
        const formattedLinesA = formatAndFitHunkLineHalf(
            lineHalfA,
            lineColorA,
            lineNoColorA
        );
        const lineColorB = lineColorForLineHalf(lineHalfB);
        const lineNoColorB = lineNoColorForLineHalf(lineHalfB);
        const formattedLinesB = formatAndFitHunkLineHalf(
            lineHalfB,
            lineColorB,
            lineNoColorB
        );
        const formattedHunkLines = [];
        for (
            let indexA = 0, indexB = 0;
            indexA < formattedLinesA.length || indexB < formattedLinesB.length;
            indexA++, indexB++
        ) {
            const formattedLineA =
                indexA < formattedLinesA.length
                    ? formattedLinesA[indexA]
                    : lineColorA(BLANK_LINE);
            const formattedLineB =
                indexB < formattedLinesB.length
                    ? formattedLinesB[indexB]
                    : lineColorB(BLANK_LINE);
            formattedHunkLines.push(formattedLineA + formattedLineB);
        }

        return formattedHunkLines;
    }

    function formatHunkSideBySide(
        hunkHeaderLine: string,
        hunkLines: string[],
        lineNoA: number,
        lineNoB: number,
        fileNameA: string,
        fileNameB: string
    ) {
        const formattedLines: string[] = [];

        for (const line of fitTextToWidth(hunkHeaderLine, SCREEN_WIDTH)) {
            formattedLines.push(HUNK_HEADER_COLOR(line.padEnd(SCREEN_WIDTH)));
        }

        let linesA: string[] = [];
        let linesB: string[] = [];

        // Each contiguous sequence of removals and additions represents a change
        // operation starting at the same line on both sides (since it has to occur
        // in the originl file). So we can render a side-by-side diff by rendering
        // the deletions and inserts in parallel, leaving out room if there are more
        // lines on one side than the other.
        function flushHunkChange() {
            let indexA = 0;
            let indexB = 0;

            while (indexA < linesA.length || indexB < linesB.length) {
                let lineA: HunkLineHalf = null;
                let lineB: HunkLineHalf = null;
                if (indexA < linesA.length) {
                    lineA = {
                        number: lineNoA.toString(),
                        prefix: linesA[indexA].slice(0, 1),
                        // truncate lines
                        text: linesA[indexA].slice(1),
                    };
                    lineNoA++;
                    indexA++;
                }
                if (indexB < linesB.length) {
                    lineB = {
                        number: lineNoB.toString(),
                        prefix: linesB[indexB].slice(0, 1),
                        // truncate lines
                        text: linesB[indexB].slice(1),
                    };
                    lineNoB++;
                    indexB++;
                }
                formattedLines.push(...formatHunkLine(lineA, lineB));
            }
        }

        for (const line of hunkLines) {
            if (line.startsWith('-')) {
                linesA.push(line);
            } else if (line.startsWith('+')) {
                linesB.push(line);
            } else {
                flushHunkChange();
                linesA = fileNameA ? [line] : [];
                linesB = fileNameB ? [line] : [];
            }
        }

        flushHunkChange();

        return formattedLines;
    }

    /**
     * Binary file diffs are hard to parse, because they are printed like:
     * "Binary files (a/<filename>|/dev/null) and (b/<filename>|/dev/null) differ"
     * but spaces in file names are not escaped, so the " and " could appear in
     * a path. So we use a regex to hopefully find the right match.
     */
    const BINARY_FILES_DIFF_REGEX = /^Binary files (?:a\/(.*)|\/dev\/null) and (?:b\/(.*)|\/dev\/null) differ$/;

    return async function* (lines: AsyncIterable<string>) {
        let state: 'commit' | 'diff' | 'hunk' = 'commit';

        // File metadata
        let fileNameA: string = '';
        let fileNameB: string = '';
        function* yieldFileName() {
            yield* formatFileName(fileNameA, fileNameB);
        }

        // Hunk metadata
        let startA: number = -1;
        let startB: number = -1;
        let hunkHeaderLine: string = '';
        let hunkLines: string[] = [];
        function* yieldHunk() {
            yield* formatHunkSideBySide(
                hunkHeaderLine,
                hunkLines,
                startA,
                startB,
                fileNameA,
                fileNameB
            );
            hunkLines = [];
        }

        for await (const line of lines) {
            // Handle state transitions
            if (line.startsWith('commit ')) {
                if (state === 'diff') {
                    yield* yieldFileName();
                } else if (state === 'hunk') {
                    yield* yieldHunk();
                    yield HORIZONTAL_SEPARATOR;
                }

                state = 'commit';
            } else if (line.startsWith('diff --git')) {
                if (state === 'diff') {
                    yield* yieldFileName();
                } else if (state === 'hunk') {
                    yield* yieldHunk();
                }

                state = 'diff';
                fileNameA = '';
                fileNameB = '';
            } else if (line.startsWith('@@')) {
                if (state === 'diff') {
                    yield* yieldFileName();
                } else if (state === 'hunk') {
                    yield* yieldHunk();
                }

                const hunkHeaderStart = line.indexOf('@@ ');
                const hunkHeaderEnd = line.indexOf(' @@', hunkHeaderStart + 1);
                assert.ok(hunkHeaderStart >= 0);
                assert.ok(hunkHeaderEnd > hunkHeaderStart);
                const hunkHeader = line.slice(
                    hunkHeaderStart + 3,
                    hunkHeaderEnd
                );
                hunkHeaderLine = line;

                const [aHeader, bHeader] = hunkHeader.split(' ');
                const [startAString] = aHeader.split(',');
                const [startBString] = bHeader.split(',');

                assert.ok(startAString.startsWith('-'));
                startA = parseInt(startAString.slice(1), 10);

                assert.ok(startBString.startsWith('+'));
                startB = parseInt(startBString.slice(1), 10);

                state = 'hunk';

                // Don't add the first line to hunkLines
                continue;
            }

            // Handle state
            switch (state) {
                case 'commit': {
                    yield formatCommitLine(line);
                    break;
                }
                case 'diff':
                    {
                        if (line.startsWith('--- a/')) {
                            fileNameA = line.slice('--- a/'.length);
                        } else if (line.startsWith('+++ b/')) {
                            fileNameB = line.slice('+++ b/'.length);
                        } else if (line.startsWith('rename from ')) {
                            fileNameA = line.slice('rename from '.length);
                        } else if (line.startsWith('rename to ')) {
                            fileNameB = line.slice('rename to '.length);
                        } else if (line.startsWith('Binary files')) {
                            const match = line.match(BINARY_FILES_DIFF_REGEX);
                            if (match) {
                                [, fileNameA, fileNameB] = match;
                            }
                        }
                    }
                    break;
                case 'hunk': {
                    hunkLines.push(line);
                    break;
                }
            }
        }

        if (state === 'diff') {
            yield* yieldFileName();
        } else if (state === 'hunk') {
            yield* yieldHunk();
        }
    };
}
