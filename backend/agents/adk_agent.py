from google.adk.agents import Agent
from google.adk.tools import FunctionTool
from agents.intake_agent import process_intake
from tools.spatial_tool import get_nearby_facilities
from tools.severity_engine import calculate_severity

# Wrapping the tools for the ADK agent
intake_tool = FunctionTool.from_function(process_intake)
spatial_tool = FunctionTool.from_function(get_nearby_facilities)
severity_tool = FunctionTool.from_function(calculate_severity)

smart311_agent = Agent(
    name='smart311_triage_orchestrator',
    tools=[intake_tool, spatial_tool, severity_tool],
    instruction="""
    You are the Smart311 Triage Orchestrator. 
    Your role is to process incoming 311 reports by:
    1. Analyzing transcripts and images to identify the complaint type and description.
    2. Fetching nearby facilities (hospitals, schools, subway entrances, fire stations) and 311 history to understand the context.
    3. Calculating the severity score and routing the report to the correct department based on all gathered information.
    """
)

if __name__ == "__main__":
    print(f"ADK Agent '{smart311_agent.name}' initialized with {len(smart311_agent.tools)} tools.")
