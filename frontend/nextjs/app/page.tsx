"use client";

import Answer from "@/components/ResearchBlocks/Answer";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import InputArea from "@/components/ResearchBlocks/InputArea";

import Sources from "@/components/ResearchBlocks/Sources";
import Question from "@/components/ResearchBlocks/Question";
import SubQuestions from "@/components/ResearchBlocks/SubQuestions";
import OrderedLogs from "@/components/ResearchBlocks/OrderedLogs";
import ImagesAlbum from "@/components/ResearchBlocks/ImagesAlbum";
import { useRef, useState, useEffect } from "react";

import { startLanggraphResearch } from '../components/Langgraph/Langgraph';
import findDifferences from '../helpers/findDifferences';
import HumanFeedback from "@/components/HumanFeedback";
import LoadingDots from "@/components/LoadingDots";
import { Data, ChatBoxSettings, QuestionData } from '../types/data';
import Image from "next/image";

export default function Home() {
  const [promptValue, setPromptValue] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatBoxSettings, setChatBoxSettings] = useState<ChatBoxSettings>({ 
    report_source: 'web', 
    report_type: 'research_report', 
    tone: 'Objective' 
  });
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<{ name: string; url: string }[]>([]);
  const [similarQuestions, setSimilarQuestions] = useState<string[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [orderedData, setOrderedData] = useState<Data[]>([]);
  const heartbeatInterval = useRef<number>();
  const [showHumanFeedback, setShowHumanFeedback] = useState(false);
  const [questionForHuman, setQuestionForHuman] = useState<true | false>(false);
  const [allLogs, setAllLogs] = useState<any[]>([]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [orderedData]);

  const startResearch = (chatBoxSettings:any) => {
    const storedConfig = localStorage.getItem('apiVariables');
    const apiVariables = storedConfig ? JSON.parse(storedConfig) : {};
    const headers = {
      'retriever': apiVariables.RETRIEVER,
      'langchain_api_key': apiVariables.LANGCHAIN_API_KEY,
      'openai_api_key': apiVariables.OPENAI_API_KEY,
      'tavily_api_key': apiVariables.TAVILY_API_KEY,
      'google_api_key': apiVariables.GOOGLE_API_KEY,
      'google_cx_key': apiVariables.GOOGLE_CX_KEY,
      'bing_api_key': apiVariables.BING_API_KEY,
      'searchapi_api_key': apiVariables.SEARCHAPI_API_KEY,
      'serpapi_api_key': apiVariables.SERPAPI_API_KEY,
      'serper_api_key': apiVariables.SERPER_API_KEY,
      'searx_url': apiVariables.SEARX_URL
    };

    if (!socket) {
      if (typeof window !== 'undefined') {
        const { protocol, pathname } = window.location;
        let { host } = window.location;
        host = host.includes('localhost') ? 'localhost:8000' : host;
        const ws_uri = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}${pathname}ws`;

        const newSocket = new WebSocket(ws_uri);
        setSocket(newSocket);

        newSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('websocket data caught in frontend: ', data);

          if (data.type === 'human_feedback' && data.content === 'request') {
            console.log('triggered human feedback condition')
            setQuestionForHuman(data.output)
            setShowHumanFeedback(true);
          } else {
            const contentAndType = `${data.content}-${data.type}`;
            setOrderedData((prevOrder) => [...prevOrder, { ...data, contentAndType }]);

            if (data.type === 'report') {
              setAnswer((prev:any) => prev + data.output);
            } else if (data.type === 'path' || data.type === 'chat') {
              setLoading(false);
            }
          }
          
        };

        newSocket.onopen = () => {
          const { task, report_type, report_source, tone } = chatBoxSettings;
          let data = "start " + JSON.stringify({ task: promptValue, report_type, report_source, tone, headers });
          newSocket.send(data);
        };

        newSocket.onclose = () => {
          clearInterval(heartbeatInterval.current);
          setSocket(null);
        };
      }
    } else {
      const { task, report_type, report_source, tone } = chatBoxSettings;
      let data = "start " + JSON.stringify({ task: promptValue, report_type, report_source, tone, headers });
      socket.send(data);
    }
  };

  // Add this function to handle feedback submission
  const handleFeedbackSubmit = (feedback: string | null) => {
    console.log('user feedback is passed to handleFeedbackSubmit: ', feedback);
    if (socket) {
      socket.send(JSON.stringify({ type: 'human_feedback', content: feedback }));
    }
    setShowHumanFeedback(false);
  };

  const handleChat = async (message: string) => {
    if (socket) {
      setShowResult(true);
      setQuestion(message);
      setLoading(true);
      setPromptValue("");
      setAnswer("");

      const questionData: QuestionData = { 
        type: 'question', 
        content: message 
      };
      setOrderedData(prevOrder => [...prevOrder, questionData]);
      
      const data = `chat${JSON.stringify({ message })}`;
      socket.send(data);
    }
  };

  const handleDisplayResult = async (newQuestion: string) => {
    setShowResult(true);
    setLoading(true);
    setQuestion(newQuestion);
    setPromptValue("");
    setAnswer("");

    // Add the new question to orderedData
    setOrderedData((prevOrder:any) => [...prevOrder, { type: 'question', content: newQuestion }]);

    const { report_type, report_source, tone } = chatBoxSettings;

    // Retrieve LANGGRAPH_HOST_URL from local storage or state
    const storedConfig = localStorage.getItem('apiVariables');
    const apiVariables = storedConfig ? JSON.parse(storedConfig) : {};
    const langgraphHostUrl = apiVariables.LANGGRAPH_HOST_URL;

    if (report_type === 'multi_agents' && langgraphHostUrl) {

      let { streamResponse, host, thread_id } = await startLanggraphResearch(newQuestion, report_source, langgraphHostUrl);

      const langsmithGuiLink = `https://smith.langchain.com/studio/thread/${thread_id}?baseUrl=${host}`;

      console.log('langsmith-gui-link in page.tsx', langsmithGuiLink);
      // Add the Langgraph button to orderedData
      setOrderedData((prevOrder) => [...prevOrder, { type: 'langgraphButton', link: langsmithGuiLink }]);

      let previousChunk = null;

      for await (const chunk of streamResponse) {
        console.log(chunk);
        if (chunk.data.report != null && chunk.data.report != "Full report content here") {
          setOrderedData((prevOrder) => [...prevOrder, { ...chunk.data, output: chunk.data.report, type: 'report' }]);
          setLoading(false);
        } else if (previousChunk) {
          const differences = findDifferences(previousChunk, chunk);
          setOrderedData((prevOrder) => [...prevOrder, { type: 'differences', content: 'differences', output: JSON.stringify(differences) }]);
        }
        previousChunk = chunk;
      }
    } else {
      startResearch(chatBoxSettings);
    }
  };

  const reset = () => {
    setShowResult(false);
    setPromptValue("");
    setQuestion("");
    setAnswer("");
    setSources([]);
    setSimilarQuestions([]);
  };

  const handleClickSuggestion = (value: string) => {
    setPromptValue(value);
    const element = document.getElementById('input-area');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const preprocessOrderedData = (data:any) => {
    const groupedData: any[] = [];
    let currentAccordionGroup:any = null;
    let currentSourceGroup:any = null;
    let currentReportGroup:any = null;
    let finalReportGroup:any = null;
    let currentImagesGroup:any = null;
    let sourceBlockEncountered = false;
    let lastSubqueriesIndex = -1;

    data.forEach((item:any, index:any) => {
      const { type, content, metadata, output, link } = item;

      if (content === 'selected_images') {
        groupedData.push({ type: 'imagesBlock', metadata });
      } else if (type === 'report') {
        if (!currentReportGroup) {
          currentReportGroup = { type: 'reportBlock', content: '' };
          groupedData.push(currentReportGroup);
        }
        currentReportGroup.content += output;
      } else if (type === 'logs' && content === 'research_report') {
        if (!finalReportGroup) {
          finalReportGroup = { type: 'reportBlock', content: '' };
          groupedData.push(finalReportGroup);
        }
        finalReportGroup.content += output.report;
      } else if (type === 'langgraphButton') {
        groupedData.push({ type: 'langgraphButton', link });
      } else if (type === 'question') {
        groupedData.push({ type: 'question', content });
      } else if (type == 'chat'){
        groupedData.push({ type: 'chat', content: content });
      }
      else {
        if (currentReportGroup) {
          currentReportGroup = null;
        }
  
        if (content === 'subqueries') {
          if (currentAccordionGroup) {
            currentAccordionGroup = null;
          }
          if (currentSourceGroup) {
            groupedData.push(currentSourceGroup);
            currentSourceGroup = null;
          }
          groupedData.push(item);
          lastSubqueriesIndex = groupedData.length - 1;
        } else if (type === 'sourceBlock') {
          currentSourceGroup = item;
          if (lastSubqueriesIndex !== -1) {
            groupedData.splice(lastSubqueriesIndex + 1, 0, currentSourceGroup);
            lastSubqueriesIndex = -1;
          } else {
            groupedData.push(currentSourceGroup);
          }
          sourceBlockEncountered = true;
          currentSourceGroup = null;
        } else if (content === 'added_source_url') {
          if (!currentSourceGroup) {
            currentSourceGroup = { type: 'sourceBlock', items: [] };
            if (lastSubqueriesIndex !== -1) {
              groupedData.splice(lastSubqueriesIndex + 1, 0, currentSourceGroup);
              lastSubqueriesIndex = -1;
            } else {
              groupedData.push(currentSourceGroup);
            }
            sourceBlockEncountered = true;
          }
          let hostname = "";
          try {
            if (typeof metadata === 'string') {
              hostname = new URL(metadata).hostname.replace('www.', '');
            }
          } catch (e) {
            console.error(`Invalid URL: ${metadata}`, e);
            hostname = "unknown"; // Default or fallback value
          }
          currentSourceGroup.items.push({ name: hostname, url: metadata });
        } else if (type !== 'path' && content !== '') {
          if (sourceBlockEncountered) {
            if (!currentAccordionGroup) {
              currentAccordionGroup = { type: 'accordionBlock', items: [] };
              groupedData.push(currentAccordionGroup);
            }
            currentAccordionGroup.items.push(item);
          } else {
            groupedData.push(item);
          }
        } else {
          if (currentAccordionGroup) {
            currentAccordionGroup = null;
          }
          if (currentSourceGroup) {
            currentSourceGroup = null;
          }
          groupedData.push(item);
        }
      }
    });
  
    return groupedData;
  };

  // Remove logs processing from renderComponentsInOrder and add this useEffect
  useEffect(() => {
    const groupedData = preprocessOrderedData(orderedData);
    const statusReports = ["agent_generated", "starting_research", "planning_research"];
    
    const newLogs: any[] = [];
    groupedData.forEach((data) => {
      if (data.type === 'accordionBlock') {
        const logs = data.items.map((item:any, subIndex:any) => ({
          header: item.content,
          text: item.output,
          metadata: item.metadata,
          key: `${item.type}-${item.content}-${subIndex}`,
        }));
        newLogs.push(...logs);
      } else if (statusReports.includes(data.content)) {
        newLogs.push({
          header: data.content,
          text: data.output,
          metadata: data.metadata,
          key: `${data.type}-${data.content}`,
        });
      }
    });
    setAllLogs(newLogs);
  }, [orderedData]); // Only run when orderedData changes

  const renderComponentsInOrder = () => {
    const groupedData = preprocessOrderedData(orderedData);
    
    // Separate components into categories
    const imageComponents = groupedData
      .filter(data => data.type === 'imagesBlock')
      .map((data, index) => (
        <div key={`images-${index}`} className="container h-auto w-full shrink-0 rounded-lg border border-solid border-[#C2C2C2] bg-gray-800 shadow-md p-5">
          <div className="flex items-start gap-4 pb-3 lg:pb-3.5">
            <Image src="/img/image.svg" alt="images" width={24} height={24} />
            <h3 className="text-base font-bold uppercase leading-[152.5%] text-white">
              Selected Images:
            </h3>
          </div>
          <div className="overflow-y-auto max-h-[500px] scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-300">
            <ImagesAlbum images={data.metadata} />
          </div>
        </div>
      ));

    const reportComponents = groupedData
      .filter(data => data.type === 'reportBlock')
      .map((data, index) => (
        <Answer key={`reportBlock-${index}`} answer={data.content} />
      ));

    const otherComponents = groupedData
      .map((data, index) => {
        if (data.type === 'sourceBlock') {
          return <Sources key={`sourceBlock-${index}`} sources={data.items}/>;
        } else if (data.type === 'question') {
          return <Question key={`question-${index}`} question={data.content} />;
        } else if (data.type === 'chat') {
          return <Answer key={`chat-${index}`} answer={data.content} />;
        } else if (data.content === 'subqueries') {
          return (
            <SubQuestions
              key={`subqueries-${index}`}
              metadata={data.metadata}
              handleClickSuggestion={handleClickSuggestion}
            />
          );
        }
        return null;
      }).filter(Boolean);

    return (
      <>
        {/* Show initial components */}
        {otherComponents}
        
        {/* Show logs section */}
        {orderedData.length > 0 && <OrderedLogs logs={allLogs} />}
        
        {/* Show images if they exist */}
        {imageComponents}
        
        {/* Show the report components last */}
        {reportComponents}
      </>
    );
  };

  return (
    <>
      <Header />
      <main className="min-h-[100vh] pt-[120px]">
        {!showResult && (
          <Hero
            promptValue={promptValue}
            setPromptValue={setPromptValue}
            handleDisplayResult={handleDisplayResult}
          />
        )}

        {showResult && (
          <div className="flex h-full w-full grow flex-col justify-between">
            <div className="container w-full space-y-2">
              <div className="container space-y-2 task-components">
                {renderComponentsInOrder()}
              </div>

              {showHumanFeedback && (
                <HumanFeedback
                  questionForHuman={questionForHuman}
                  websocket={socket}
                  onFeedbackSubmit={handleFeedbackSubmit}
                />
              )}

              <div className="pt-1 sm:pt-2" ref={chatContainerRef}></div>
            </div>
            <div id="input-area" className="container px-4 lg:px-0">
              {loading ? (
                <LoadingDots />
              ) : (
                <InputArea
                  promptValue={promptValue}
                  setPromptValue={setPromptValue}
                  handleSubmit={handleChat}
                  handleSecondary={handleDisplayResult}
                  disabled={loading}
                  reset={reset}
                />
              )}
            </div>
          </div>
        )}
      </main>
      <Footer setChatBoxSettings={setChatBoxSettings} chatBoxSettings={chatBoxSettings} />
    </>
  );
}