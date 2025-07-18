import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { vue } from "@codemirror/lang-vue";
import { EditorSelection } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { svelte } from "@replit/codemirror-lang-svelte";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { graphql } from "cm6-graphql";
import * as codeMirrorLangBiomeAst from "codemirror-lang-rome-ast";
import {
	createRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import CodeMirror from "@/playground/CodeMirror";
import DiagnosticsPane from "@/playground/components/DiagnosticsPane";
import Resizable from "@/playground/components/Resizable";
import SettingsPanel from "@/playground/components/SettingsPanel";
import Tabs from "@/playground/components/Tabs";
import ControlFlowTab from "@/playground/tabs/ControlFlowTab";
import DiagnosticsConsoleTab from "@/playground/tabs/DiagnosticsConsoleTab";
import DiagnosticsListTab from "@/playground/tabs/DiagnosticsListTab";
import FormatterCodeTab from "@/playground/tabs/FormatterCodeTab";
import FormatterIrTab from "@/playground/tabs/FormatterIrTab";
import SettingsTab from "@/playground/tabs/SettingsTab";
import SyntaxTab from "@/playground/tabs/SyntaxTab";
import TyeInfoTab from "@/playground/tabs/TypeInfoTab";
import {
	type BiomeAstSyntacticData,
	type PlaygroundProps,
	PlaygroundTab,
} from "@/playground/types";
import {
	getCurrentCode,
	getFileState,
	isCssFilename,
	isGraphqlFilename,
	isHtmlFilename,
	isJsonFilename,
	isJsxFilename,
	isSvelteFilename,
	isTypeScriptFilename,
	isVueFilename,
	useWindowSize,
} from "@/playground/utils";
import AnalyzerFixesTab from "./tabs/AnalyzerFixesTab";
import SemanticModelTab from "./tabs/SemanticModelTab";

export default function Playground({
	setPlaygroundState,
	resetPlaygroundState,
	playgroundState,
}: PlaygroundProps) {
	const [clipboardStatus, setClipboardStatus] = useState<
		"success" | "failed" | "normal"
	>("normal");

	const file = getFileState(playgroundState, playgroundState.currentFile);
	const biomeOutput = file.biome;
	const prettierOutput = file.prettier;

	const codeMirrorExtensions = useMemo(() => {
		if (isJsonFilename(playgroundState.currentFile)) {
			return [json()];
		}
		if (isCssFilename(playgroundState.currentFile)) {
			return [css()];
		}
		if (isGraphqlFilename(playgroundState.currentFile)) {
			return [graphql()];
		}
		if (isHtmlFilename(playgroundState.currentFile)) {
			return [html()];
		}
		if (isVueFilename(playgroundState.currentFile)) {
			return [vue()];
		}
		if (isSvelteFilename(playgroundState.currentFile)) {
			return [svelte()];
		}
		return [
			javascript({
				jsx: isJsxFilename(playgroundState.currentFile),
				typescript: isTypeScriptFilename(playgroundState.currentFile),
			}),
		];
	}, [playgroundState.currentFile]);

	const biomeAstSyntacticDataRef = useRef<BiomeAstSyntacticData | null>(null);

	const astPanelCodeMirrorRef = useRef<null | ReactCodeMirrorRef>(null);

	useEffect(() => {
		if (clipboardStatus !== "normal") {
			setClipboardStatus("normal");
		}
	}, [clipboardStatus]);

	const onUpdate = useCallback(
		(viewUpdate: ViewUpdate) => {
			const cursorPosition = viewUpdate.state.selection.ranges[0]?.from ?? 0;
			setPlaygroundState((state) =>
				state.cursorPosition !== cursorPosition
					? {
							...state,
							cursorPosition,
						}
					: state,
			);
		},
		[setPlaygroundState],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies(scrollAstNodeIntoView): not needed
	useEffect(() => {
		scrollAstNodeIntoView(playgroundState.cursorPosition);
	}, [playgroundState.cursorPosition]);

	// We update the syntactic data of `BiomeJsAst` only AstSource(`Display` string of our original AstRepresentation) changed.
	useEffect(() => {
		const ast = biomeOutput.syntax.ast;
		const tree = codeMirrorLangBiomeAst.parser.parse(ast);
		const rangeMap = new Map();
		biomeAstSyntacticDataRef.current = {
			ast: tree,
			rangeMap,
		};
		tree.iterate({
			enter(node) {
				if (node.type.name === "SyntaxToken") {
					const range = node.node.getChild("Range");
					if (!range) {
						return;
					}
					let current = range.firstChild;
					// Checking if current node is broken
					while (current) {
						if (current.type.isError) {
							return;
						}
						current = current.nextSibling;
					}

					const children = range.node.getChildren("Number");
					const first = children.at(0)?.node;
					const second = children.at(1)?.node;
					if (first && second) {
						const start = +ast.slice(first.from, first.to);
						const end = +ast.slice(second.from, second.to);
						rangeMap.set([start, end], [node.from, node.to]);
					}
				}
			},
		});
	}, [biomeOutput.syntax.ast]);

	const onChange = useCallback(
		(value: string) => {
			setPlaygroundState((state) => ({
				...state,
				files: {
					...state.files,
					[state.currentFile]: {
						...getFileState(state, state.currentFile),
						content: value,
					},
				},
			}));
		},
		[setPlaygroundState],
	);

	const { width } = useWindowSize();
	const hasNarrowViewport = width !== undefined && width <= 1000;

	const editorRef = createRef<ReactCodeMirrorRef>();

	const code = getCurrentCode(playgroundState) ?? "";

	const editor = (
		<CodeMirror
			ref={editorRef}
			diagnostics={biomeOutput.diagnostics.list}
			value={code}
			extensions={codeMirrorExtensions}
			placeholder="Enter your code here"
			onUpdate={onUpdate}
			onChange={onChange}
			autoFocus={true}
			data-testid="editor"
		/>
	);

	const results = (
		<Tabs
			className="results-tabs"
			data-testid="results-tabs"
			selectedTab={playgroundState.tab}
			onSelect={(tab) =>
				setPlaygroundState((state) => ({
					...state,
					tab: tab as PlaygroundTab,
				}))
			}
			tabs={[
				{
					key: PlaygroundTab.Code,
					title: "Code",
					visible: hasNarrowViewport,
					children: editor,
				},
				{
					key: PlaygroundTab.Diagnostics,
					title: "Diagnostics",
					visible: hasNarrowViewport,
					children: (
						<DiagnosticsListTab
							editorRef={editorRef}
							code={code}
							diagnostics={biomeOutput.diagnostics.list}
						/>
					),
				},
				{
					key: PlaygroundTab.Formatter,
					title: "Formatter",
					children: (
						<FormatterCodeTab
							biome={biomeOutput.formatter.code}
							prettier={prettierOutput}
							extensions={codeMirrorExtensions}
						/>
					),
				},
				{
					key: PlaygroundTab.FormatterIr,
					title: "Formatter IR",
					children: (
						<FormatterIrTab
							biome={biomeOutput.formatter.ir}
							prettier={prettierOutput}
						/>
					),
				},
				{
					key: PlaygroundTab.AnalyzerFixes,
					title: "Analyzer Fixes",
					children: (
						<AnalyzerFixesTab
							code={biomeOutput.analysis.fixed}
							extensions={codeMirrorExtensions}
						/>
					),
				},
				{
					key: PlaygroundTab.Syntax,
					title: "Syntax",
					children: (
						<SyntaxTab
							ast={biomeOutput.syntax.ast}
							cst={biomeOutput.syntax.cst}
							ref={astPanelCodeMirrorRef}
						/>
					),
				},
				{
					key: PlaygroundTab.ControlFlowGraph,
					title: "Control Flow Graph",
					children: (
						<ControlFlowTab graph={biomeOutput.analysis.controlFlowGraph} />
					),
				},
				{
					key: PlaygroundTab.TypesIr,
					title: "Types IR",
					children: (
						<TyeInfoTab
							code={biomeOutput.types.ir}
							extensions={codeMirrorExtensions}
						/>
					),
				},
				{
					key: PlaygroundTab.TypesRegistered,
					title: "Types Registered",
					children: (
						<TyeInfoTab
							code={biomeOutput.types.registered}
							extensions={codeMirrorExtensions}
						/>
					),
				},
				{
					key: PlaygroundTab.SemanticModel,
					title: "Semantic Model",
					children: (
						<SemanticModelTab
							code={biomeOutput.analysis.semanticModel}
							extensions={codeMirrorExtensions}
						/>
					),
				},
				{
					key: PlaygroundTab.Console,
					title: "Console",
					visible: hasNarrowViewport,
					children: (
						<DiagnosticsConsoleTab console={biomeOutput.diagnostics.console} />
					),
				},
				{
					key: PlaygroundTab.Settings,
					title: "Settings",
					visible: hasNarrowViewport,
					children: (
						<SettingsTab
							onReset={resetPlaygroundState}
							state={playgroundState}
							setPlaygroundState={setPlaygroundState}
						/>
					),
				},
			]}
		/>
	);

	if (hasNarrowViewport) {
		return results;
	}

	return (
		<>
			<SettingsPanel
				onReset={resetPlaygroundState}
				state={playgroundState}
				setPlaygroundState={setPlaygroundState}
			/>

			<div className="code-pane">
				{editor}
				<Resizable
					className="diagnostics-pane"
					name="diagnostics"
					direction="top"
				>
					<DiagnosticsPane
						editorRef={editorRef}
						console={biomeOutput.diagnostics.console}
						diagnostics={biomeOutput.diagnostics.list}
						code={code}
					/>
				</Resizable>
			</div>

			<Resizable className="results-pane" name="results-pane" direction="left">
				{results}
			</Resizable>
		</>
	);

	function scrollAstNodeIntoView(cursorPosition: number) {
		if (
			astPanelCodeMirrorRef.current == null ||
			biomeAstSyntacticDataRef.current == null
		) {
			return;
		}

		const view = astPanelCodeMirrorRef.current.view;
		const rangeMap = biomeAstSyntacticDataRef.current.rangeMap;

		for (const [sourceRange, displaySourceRange] of rangeMap.entries()) {
			if (
				cursorPosition >= sourceRange[0] &&
				cursorPosition <= sourceRange[1]
			) {
				view?.dispatch({
					scrollIntoView: true,
					selection: EditorSelection.create([
						EditorSelection.range(displaySourceRange[0], displaySourceRange[1]),
						EditorSelection.cursor(displaySourceRange[0]),
					]),
				});
			}
		}
	}
}
